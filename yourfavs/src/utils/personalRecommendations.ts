import { processBatch } from './processBatch';
import { tmdbFetch, tmdbFetchList } from '../services/API/shared/tmdbClient';
import { calculateGenrePreferences } from './genrePreferences';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getMovieFav, getLikedMovies, getMoviesVistas } from '../services/BD/movies/yourfavsMovie';
import { getSerieFav, getLikedSeries, getSeriesSiguiendo, getSeriesVistas } from '../services/BD/series/yourfavsSerie';

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

const BLOB_KEY = 'personalRecs_v6';
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
// Tu nota: lo que TÚ puntuaste alto pesa extra (aditivo: un fav con nota 9 suma
// 2 + 1.75). Entre favs (2) y like (1.5) para no destronar a favoritos sin nota.
const SEED_WEIGHT_RATING = 1.75;
const RATING_SEED_MIN = 8;
const SEED_LIMIT = 6;
const RESULT_LIMIT = 20;
// E: filtro vote_count mínimo para cortar nicho obscuro (pelis más exigente que series).
const MIN_VOTE_COUNT_MOVIE = 300;
const MIN_VOTE_COUNT_TV = 150;
// H: cap por seed → 1 seed nicho no puede monopolizar el pool con 10 recos cerradas.
// Asimétrico: series 6 (biblioteca ecléctica, necesita más muestras para que haya solape
// entre seeds dispares); pelis 3 (universo más cohesivo, basta con top-rated por seed).
const MAX_ITEMS_PER_SEED_MOVIE = 3;
const MAX_ITEMS_PER_SEED_TV = 6;

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

    const [movFavs, movLike, movVistas, tvFavs, tvLike, tvSig, tvVistas] = await Promise.all([
        getMovieFav(), getLikedMovies(), getMoviesVistas(),
        getSerieFav(), getLikedSeries(), getSeriesSiguiendo(), getSeriesVistas(),
    ]);

    const movieMap = new Map<string, number>();
    setSum(movieMap, movFavs as any, SEED_WEIGHT_FAVS);
    setSum(movieMap, movLike as any, SEED_WEIGHT_LIKE);

    const tvMap = new Map<string, number>();
    setSum(tvMap, tvFavs as any, SEED_WEIGHT_FAVS);
    setSum(tvMap, tvLike as any, SEED_WEIGHT_LIKE);
    setSum(tvMap, tvSig as any, SEED_WEIGHT_SIGUIENDO);

    // Semilla por "Tu nota": cualquier título puntuado >= RATING_SEED_MIN en
    // cualquiera de las listas entra (o se refuerza) como seed. Dedup por id:
    // los tiers son excluyentes, pero por si un doc viviera en dos listas.
    const highRated = (lists: any[][]) => {
        const seen = new Set<string>();
        const out: { id: string }[] = [];
        for (const list of lists) for (const d of list) {
            if (typeof d.rating === 'number' && d.rating >= RATING_SEED_MIN && !seen.has(String(d.id))) {
                seen.add(String(d.id));
                out.push({ id: String(d.id) });
            }
        }
        return out;
    };
    setSum(movieMap, highRated([movFavs as any, movLike as any, movVistas as any]), SEED_WEIGHT_RATING);
    setSum(tvMap, highRated([tvFavs as any, tvLike as any, tvSig as any, tvVistas as any]), SEED_WEIGHT_RATING);

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

    // Discover endurecido por géneros top: corre EN PARALELO con recommendations.
    // Sus resultados se mergean al pool con score base bajo (DISCOVER_BOOST), boosteando
    // candidatos que ya venían de seeds y rellenando el long tail con joyas del género.
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

    // Booster conservador: candidatos que solo vienen de discover entran con score 0.5 y
    // sources 0, así nunca superan a un seed real en el ranking; los que coinciden con un
    // seed reciben +0.5 al score (sources no se incrementa: solo seeds cuentan como fuente).
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
    // sources sigue siendo la señal dominante, pero rating evita que pelis 2-seeds mediocres
    // entierren a pelis 1-seed con rating excepcional (Matrix ⭐8.2 vs Tomb Raider ⭐6.4).
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
