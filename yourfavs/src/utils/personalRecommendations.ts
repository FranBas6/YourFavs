import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { calculateGenrePreferences } from './genrePreferences';
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
    /** Cuántos candidatos quedaron tras filtro afinidad / total candidatos */
    filterStats: {
        movies: { kept: number; total: number };
        tv: { kept: number; total: number };
    };
}

const TTL_MS = 30 * 60 * 1000;
let cache: { data: PersonalRecResult; expires: number } | null = null;

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

function filterByGenreAffinity(
    entries: Array<[string, number]>,
    genresById: Record<string, number[]>,
    topGenres: number[],
): Array<[string, number, number[]]> {
    const top = new Set(topGenres);
    const out: Array<[string, number, number[]]> = [];
    for (const [id, weight] of entries) {
        const genres = genresById[id] || [];
        if (genres.some(g => top.has(g))) out.push([id, weight, genres]);
    }
    return out;
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

    const movieFiltered = filterByGenreAffinity(movieEntries, prefs.genresById.movies, prefs.movies.topGenres);
    const tvFiltered = filterByGenreAffinity(tvEntries, prefs.genresById.tv, prefs.tv.topGenres);

    // Completar hasta SEED_LIMIT: filtered como prioridad, rellenar con los descartados (también
    // ordenados por peso) si no llegamos al límite. Así nunca degradamos a "sin filtro" entero.
    function completeSeeds(
        filtered: Array<[string, number, number[]]>,
        all: Array<[string, number]>,
        genresById: Record<string, number[]>,
        limit: number,
    ): Array<[string, number, number[]]> {
        if (filtered.length >= limit) return filtered;
        const filteredIds = new Set(filtered.map(([id]) => id));
        const fillers = all
            .filter(([id]) => !filteredIds.has(id))
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit - filtered.length)
            .map(([id, w]) => [id, w, genresById[id] || []] as [string, number, number[]]);
        return [...filtered, ...fillers];
    }

    const movieFinal = completeSeeds(movieFiltered, movieEntries, prefs.genresById.movies, SEED_LIMIT);
    const tvFinal = completeSeeds(tvFiltered, tvEntries, prefs.genresById.tv, SEED_LIMIT);

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
            b.score - a.score ||
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
            movies: { kept: movieFiltered.length, total: movieEntries.length },
            tv: { kept: tvFiltered.length, total: tvEntries.length },
        },
    };

    cache = { data, expires: now + TTL_MS };
    return data;
}

export function invalidatePersonalRecsCache() {
    cache = null;
}
