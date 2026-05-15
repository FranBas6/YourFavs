import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { calculateGenrePreferences } from './genrePreferences';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getMovieFav, getLikedMovies } from '../services/BD/movies/yourfavsMovie';
import { getSerieFav, getLikedSeries, getSeriesSiguiendo } from '../services/BD/series/yourfavsSerie';

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

const BLOB_KEY = 'personalRecs_v2';
const L1_TTL_MS = 30 * 60 * 1000;       // 30min memoria
const L2_TTL_MS = 6 * 60 * 60 * 1000;   // 6h Netlify Blobs
let cache: { data: PersonalRecResult; expires: number } | null = null;

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

const SEED_WEIGHT_FAVS = 2;
const SEED_WEIGHT_LIKE = 1.5;
const SEED_WEIGHT_SIGUIENDO = 1.5;
const SEED_LIMIT = 12;
const RESULT_LIMIT = 20;

function setSum(map: Map<string, number>, items: { id: string }[], weight: number) {
    for (const it of items) {
        map.set(it.id, (map.get(it.id) ?? 0) + weight);
    }
}

const AFFINITY_BOOST_SCALE = 2;

/**
 * Filtra candidatos que tocan al menos 1 género top y boostea por afinidad ponderada.
 * Boost = (Σ peso_real_género_usuario) / nº_géneros_seed / max_peso → 0..1 × scale.
 * Penaliza seeds multi-etiqueta (anime/familia) frente a seeds limpios en géneros top.
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
 * Mata cosas tipo "3 Guardianes de la Galaxia con [Sci-Fi, Aventura, Acción]" → solo el mejor.
 * Empuja diversidad sin fetch extra.
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

export async function getPersonalRecommendations(): Promise<PersonalRecResult> {
    const now = Date.now();
    if (cache && cache.expires > now) return cache.data;

    // L2: si la Lambda es fría pero hay un cómputo reciente en Blobs, lo usamos.
    const cachedL2 = await getCached<SerializedRecs>(BLOB_KEY);
    if (cachedL2) {
        const data = deserializeRecs(cachedL2);
        cache = { data, expires: now + L1_TTL_MS };
        return data;
    }

    const prefs = await calculateGenrePreferences();

    const [movFavs, movLike, tvFavs, tvLike, tvSig] = await Promise.all([
        getMovieFav(), getLikedMovies(),
        getSerieFav(), getLikedSeries(), getSeriesSiguiendo(),
    ]);

    const movieMap = new Map<string, number>();
    setSum(movieMap, movFavs as any, SEED_WEIGHT_FAVS);
    setSum(movieMap, movLike as any, SEED_WEIGHT_LIKE);

    const tvMap = new Map<string, number>();
    setSum(tvMap, tvFavs as any, SEED_WEIGHT_FAVS);
    setSum(tvMap, tvLike as any, SEED_WEIGHT_LIKE);
    setSum(tvMap, tvSig as any, SEED_WEIGHT_SIGUIENDO);

    const movieEntries = Array.from(movieMap.entries());
    const tvEntries = Array.from(tvMap.entries());

    const movieFiltered = filterByGenreAffinity(movieEntries, prefs.genresById.movies, prefs.movies.topGenres, prefs.movies.weighted);
    const tvFiltered = filterByGenreAffinity(tvEntries, prefs.genresById.tv, prefs.tv.topGenres, prefs.tv.weighted);

    const movieDiversified = diversifyByGenreProfile(movieFiltered);
    const tvDiversified = diversifyByGenreProfile(tvFiltered);

    // Completar hasta SEED_LIMIT: diversified como prioridad, rellenar con los descartados
    // (incluyendo perfiles duplicados o sin afinidad) si no llegamos al límite.
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

    await Promise.all([
        processBatch(movieSeeds, async (seed: SeedInfo) => {
            try {
                const r = await tmdbFetch<any>(`/movie/${seed.id}/recommendations`);
                const detail = await tmdbFetch<any>(`/movie/${seed.id}`).catch(() => null);
                if (detail?.title) seed.title = detail.title;
                for (const m of (r?.results || [])) {
                    if (prefs.libraryIds.movies.has(String(m.id))) continue;
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
                const detail = await tmdbFetch<any>(`/tv/${seed.id}`).catch(() => null);
                if (detail?.name) seed.title = detail.name;
                for (const m of (r?.results || [])) {
                    if (prefs.libraryIds.tv.has(String(m.id))) continue;
                    const k = String(m.id);
                    const cur = tvAgg.get(k);
                    if (cur) { cur.score += seed.weight; cur.sources += 1; }
                    else tvAgg.set(k, { item: m, score: seed.weight, sources: 1 });
                }
            } catch {}
        }, 8),
    ]);

    const sortAgg = (m: Map<string, Agg>) => Array.from(m.values())
        .sort((a, b) =>
            b.sources - a.sources ||
            b.score - a.score ||
            (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0)
        )
        .slice(0, RESULT_LIMIT)
        .map(r => ({ ...r.item, _recScore: r.score, _recSources: r.sources }));

    const data: PersonalRecResult = {
        movies: sortAgg(movieAgg),
        tv: sortAgg(tvAgg),
        seedsMovies: movieSeeds,
        seedsTv: tvSeeds,
        libraryIds: prefs.libraryIds,
        filterStats: {
            movies: { kept: movieFiltered.length, diversified: movieDiversified.length, total: movieEntries.length },
            tv: { kept: tvFiltered.length, diversified: tvDiversified.length, total: tvEntries.length },
        },
    };

    cache = { data, expires: now + L1_TTL_MS };
    setCached(BLOB_KEY, serializeRecs(data), L2_TTL_MS).catch(() => {});
    return data;
}

export function invalidatePersonalRecsCache() {
    cache = null;
    invalidateCached(BLOB_KEY).catch(() => {});
}
