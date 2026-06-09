import { processBatch } from './processBatch';
import { tmdbFetch, tmdbFetchList } from '../services/API/shared/tmdbClient';
import { getTrending } from '../services/API/shared/tmdbDiscoverService';
import { calculateGenrePreferences } from './genrePreferences';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getCurrentUid } from '../services/BD/shared/userScope';

export interface SeedInfo {
    id: string;
    weight: number;
    title?: string;
    genres?: number[];
}

export interface PersonalRecResult {
    movies: any[];
    tv: any[];
    seedsMovies: SeedInfo[];
    seedsTv: SeedInfo[];
    libraryIds: { movies: Set<string>; tv: Set<string> };
    /** Cuántos candidatos quedaron tras cada paso */
    filterStats: {
        movies: { kept: number; diversified: number; total: number };
        tv: { kept: number; diversified: number; total: number };
    };
}

type SerializedRecs = Omit<PersonalRecResult, 'libraryIds'> & {
    libraryIds: { movies: string[]; tv: string[] };
};

const BLOB_KEY = 'personalRecs_v7';     // v7: semillas favs+taste, keyed por uid, fallback a tendencias
const L1_TTL_MS = 30 * 60 * 1000;       // 30min memoria
const L2_TTL_MS = 6 * 60 * 60 * 1000;   // 6h Netlify Blobs
const l1 = new Map<string, { data: PersonalRecResult; expires: number }>();

function deserializeRecs(s: SerializedRecs): PersonalRecResult {
    return {
        ...s,
        libraryIds: {
            movies: new Set(s.libraryIds.movies),
            tv: new Set(s.libraryIds.tv),
        },
    };
}

function serializeRecs(r: PersonalRecResult): SerializedRecs {
    return {
        ...r,
        libraryIds: {
            movies: Array.from(r.libraryIds.movies),
            tv: Array.from(r.libraryIds.tv),
        },
    };
}

const SEED_LIMIT = 6;
const RESULT_LIMIT = 20;
// E: filtro vote_count mínimo para cortar nicho obscuro (pelis más exigente que series).
const MIN_VOTE_COUNT_MOVIE = 300;
const MIN_VOTE_COUNT_TV = 150;
// H: cap por seed → 1 seed nicho no puede monopolizar el pool con 10 recos cerradas.
const MAX_ITEMS_PER_SEED_MOVIE = 3;
const MAX_ITEMS_PER_SEED_TV = 6;

const AFFINITY_BOOST_SCALE = 2;

/**
 * Filtra candidatos que tocan al menos 1 género top y boostea por afinidad ponderada.
 */
function filterByGenreAffinity(
    entries: Array<[string, number]>,
    genresById: Record<string, number[]>,
    topGenres: number[],
    weighted: Record<number, number>,
): Array<[string, number, number[]]> {
    const top = new Set(topGenres);
    const out: Array<[string, number, number[]]> = [];
    let maxW = 0;
    for (const w of Object.values(weighted)) if (w > maxW) maxW = w;
    for (const [id, baseWeight] of entries) {
        const genres = genresById[id] || [];
        let matches = 0;
        let sum = 0;
        for (const g of genres) {
            if (top.has(g)) matches++;
            sum += weighted[g] || 0;
        }
        if (matches === 0) continue;
        const normalized = maxW > 0 ? (sum / Math.max(1, genres.length)) / maxW : 0;
        out.push([id, baseWeight + normalized * AFFINITY_BOOST_SCALE, genres]);
    }
    return out;
}

/**
 * Si dos candidatos tienen el mismo set ordenado de géneros, mantener solo el de mayor peso.
 */
function diversifyByGenreProfile(
    items: Array<[string, number, number[]]>,
): Array<[string, number, number[]]> {
    const best = new Map<string, [string, number, number[]]>();
    for (const item of items) {
        const [, weight, genres] = item;
        const key = [...genres].sort((a, b) => a - b).join(',');
        const cur = best.get(key);
        if (!cur || weight > cur[1]) best.set(key, item);
    }
    return Array.from(best.values());
}

function topSeedsFiltered(
    filtered: Array<[string, number, number[]]>,
    limit: number,
): SeedInfo[] {
    return filtered
        .slice()
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([id, weight, genres]) => ({ id, weight, genres }));
}

/** Cuando no hay semillas ni género (usuario sin favs ni onboarding): tendencias. */
async function trendingFallback(
    mediaType: 'movie' | 'tv',
    libIds: Set<string>,
    minVotes: number,
): Promise<any[]> {
    const list = await getTrending<any>(mediaType, 'week').catch(() => [] as any[]);
    return list
        .filter((m) => !libIds.has(String(m.id)) && (m.vote_count ?? 0) >= minVotes)
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, RESULT_LIMIT)
        .map((m) => ({ ...m, _recScore: 0, _recSources: 0, _fallback: true }));
}

export async function getPersonalRecommendations(): Promise<PersonalRecResult> {
    const uidKey = getCurrentUid() ?? 'guest';
    const blobKey = `${BLOB_KEY}:${uidKey}`;
    const now = Date.now();

    const hit = l1.get(uidKey);
    if (hit && hit.expires > now) return hit.data;

    // L2: si la Lambda es fría pero hay un cómputo reciente en Blobs, lo usamos.
    const cachedL2 = await getCached<SerializedRecs>(blobKey);
    if (cachedL2) {
        const data = deserializeRecs(cachedL2);
        l1.set(uidKey, { data, expires: now + L1_TTL_MS });
        return data;
    }

    const prefs = await calculateGenrePreferences();

    // Semillas = favoritos + títulos del onboarding (ya calculadas en prefs, sin re-leer BD).
    const movieEntries = prefs.seeds.movies;
    const tvEntries = prefs.seeds.tv;

    const movieFiltered = filterByGenreAffinity(movieEntries, prefs.genresById.movies, prefs.movies.topGenres, prefs.movies.weighted);
    const tvFiltered = filterByGenreAffinity(tvEntries, prefs.genresById.tv, prefs.tv.topGenres, prefs.tv.weighted);

    const movieDiversified = diversifyByGenreProfile(movieFiltered);
    const tvDiversified = diversifyByGenreProfile(tvFiltered);

    // Completar hasta SEED_LIMIT: diversified como prioridad, rellenar con los descartados.
    function completeSeeds(
        primary: Array<[string, number, number[]]>,
        all: Array<[string, number]>,
        genresById: Record<string, number[]>,
        limit: number,
    ): Array<[string, number, number[]]> {
        if (primary.length >= limit) return primary;
        const usedIds = new Set(primary.map(([id]) => id));
        const fillers = all
            .filter(([id]) => !usedIds.has(id))
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit - primary.length)
            .map(([id, w]) => [id, w, genresById[id] || []] as [string, number, number[]]);
        return [...primary, ...fillers];
    }

    const movieFinal = completeSeeds(movieDiversified, movieEntries, prefs.genresById.movies, SEED_LIMIT);
    const tvFinal = completeSeeds(tvDiversified, tvEntries, prefs.genresById.tv, SEED_LIMIT);

    const movieSeeds = topSeedsFiltered(movieFinal, SEED_LIMIT);
    const tvSeeds = topSeedsFiltered(tvFinal, SEED_LIMIT);

    type Agg = { item: any; score: number; sources: number };
    const movieAgg = new Map<string, Agg>();
    const tvAgg = new Map<string, Agg>();

    // Discover endurecido por géneros top: corre EN PARALELO con recommendations.
    const movieGenresParam = prefs.movies.topGenres.join('|');
    const tvGenresParam = prefs.tv.topGenres.join('|');
    const discoverMoviePromise = movieGenresParam
        ? tmdbFetchList<any>('/discover/movie', {
            with_genres: movieGenresParam,
            sort_by: 'vote_average.desc',
            'vote_count.gte': '500',
            'vote_average.gte': '7',
            include_adult: 'false',
            page: '1',
        }).catch(() => [] as any[])
        : Promise.resolve([] as any[]);
    const discoverTvPromise = tvGenresParam
        ? tmdbFetchList<any>('/discover/tv', {
            with_genres: tvGenresParam,
            sort_by: 'vote_average.desc',
            'vote_count.gte': '200',
            'vote_average.gte': '7',
            include_adult: 'false',
            page: '1',
        }).catch(() => [] as any[])
        : Promise.resolve([] as any[]);

    const [, , discoverMoviesList, discoverTvList] = await Promise.all([
        processBatch(movieSeeds, async (seed: SeedInfo) => {
            try {
                const r = await tmdbFetch<any>(`/movie/${seed.id}/recommendations`);
                const eligible = (r?.results || [])
                    .filter((m: any) => !prefs.libraryIds.movies.has(String(m.id)) && (m.vote_count ?? 0) >= MIN_VOTE_COUNT_MOVIE)
                    .sort((a: any, b: any) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
                    .slice(0, MAX_ITEMS_PER_SEED_MOVIE);
                for (const m of eligible) {
                    const k = String(m.id);
                    const cur = movieAgg.get(k);
                    if (cur) { cur.score += seed.weight; cur.sources += 1; }
                    else movieAgg.set(k, { item: m, score: seed.weight, sources: 1 });
                }
            } catch {}
        }, 8),
        processBatch(tvSeeds, async (seed: SeedInfo) => {
            try {
                const r = await tmdbFetch<any>(`/tv/${seed.id}/recommendations`);
                const eligible = (r?.results || [])
                    .filter((m: any) => !prefs.libraryIds.tv.has(String(m.id)) && (m.vote_count ?? 0) >= MIN_VOTE_COUNT_TV)
                    .sort((a: any, b: any) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
                    .slice(0, MAX_ITEMS_PER_SEED_TV);
                for (const m of eligible) {
                    const k = String(m.id);
                    const cur = tvAgg.get(k);
                    if (cur) { cur.score += seed.weight; cur.sources += 1; }
                    else tvAgg.set(k, { item: m, score: seed.weight, sources: 1 });
                }
            } catch {}
        }, 8),
        discoverMoviePromise,
        discoverTvPromise,
    ]);

    // Booster conservador: candidatos solo-discover entran con score bajo; los que coinciden
    // con un seed reciben +0.5 (sources no se incrementa: solo seeds cuentan como fuente).
    const DISCOVER_BOOST = 0.5;
    for (const m of discoverMoviesList) {
        const k = String(m.id);
        if (prefs.libraryIds.movies.has(k)) continue;
        if ((m.vote_count ?? 0) < MIN_VOTE_COUNT_MOVIE) continue;
        const cur = movieAgg.get(k);
        if (cur) cur.score += DISCOVER_BOOST;
        else movieAgg.set(k, { item: m, score: DISCOVER_BOOST, sources: 0 });
    }
    for (const s of discoverTvList) {
        const k = String(s.id);
        if (prefs.libraryIds.tv.has(k)) continue;
        if ((s.vote_count ?? 0) < MIN_VOTE_COUNT_TV) continue;
        const cur = tvAgg.get(k);
        if (cur) cur.score += DISCOVER_BOOST;
        else tvAgg.set(k, { item: s, score: DISCOVER_BOOST, sources: 0 });
    }

    // I: score híbrido. sources×1.5 + score×0.5 + (rating/10)×2.
    const hybridScore = (a: Agg) =>
        a.sources * 1.5 + a.score * 0.5 + ((a.item.vote_average ?? 0) / 10) * 2;
    const sortAgg = (m: Map<string, Agg>) => Array.from(m.values())
        .sort((a, b) =>
            hybridScore(b) - hybridScore(a) ||
            b.sources - a.sources ||
            (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0)
        )
        .slice(0, RESULT_LIMIT)
        .map(r => ({ ...r.item, _recScore: r.score, _recSources: r.sources }));

    let movies = sortAgg(movieAgg);
    let tv = sortAgg(tvAgg);

    // Fallback: sin semillas ni género (usuario nuevo sin favs ni onboarding) el pool queda
    // vacío → mostramos tendencias en vez de un hueco. También cubre cobertura parcial.
    if (movies.length === 0) movies = await trendingFallback('movie', prefs.libraryIds.movies, MIN_VOTE_COUNT_MOVIE);
    if (tv.length === 0) tv = await trendingFallback('tv', prefs.libraryIds.tv, MIN_VOTE_COUNT_TV);

    const data: PersonalRecResult = {
        movies,
        tv,
        seedsMovies: movieSeeds,
        seedsTv: tvSeeds,
        libraryIds: prefs.libraryIds,
        filterStats: {
            movies: { kept: movieFiltered.length, diversified: movieDiversified.length, total: movieEntries.length },
            tv: { kept: tvFiltered.length, diversified: tvDiversified.length, total: tvEntries.length },
        },
    };

    l1.set(uidKey, { data, expires: now + L1_TTL_MS });
    setCached(blobKey, serializeRecs(data), L2_TTL_MS).catch(() => {});
    return data;
}

export function invalidatePersonalRecsCache() {
    const uidKey = getCurrentUid() ?? 'guest';
    l1.delete(uidKey);
    invalidateCached(`${BLOB_KEY}:${uidKey}`).catch(() => {});
}
