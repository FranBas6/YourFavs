import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { calculateGenrePreferences } from './genrePreferences';
import { getMovieFav, getLikedMovies } from '../services/BD/movies/yourfavsMovie';
import { getSerieFav, getLikedSeries, getSeriesSiguiendo } from '../services/BD/series/yourfavsSerie';

export interface SeedInfo {
    id: string;
    weight: number;
    title?: string;
}

export interface PersonalRecResult {
    movies: any[];
    tv: any[];
    seedsMovies: SeedInfo[];
    seedsTv: SeedInfo[];
    libraryIds: { movies: Set<string>; tv: Set<string> };
}

const TTL_MS = 30 * 60 * 1000;
let cache: { data: PersonalRecResult; expires: number } | null = null;

const SEED_WEIGHT_FAVS = 2;
const SEED_WEIGHT_LIKE = 1.5;
const SEED_WEIGHT_SIGUIENDO = 1.5;
const SEED_LIMIT = 8;
const RESULT_LIMIT = 20;

function setMax(map: Map<string, number>, items: { id: string }[], weight: number) {
    for (const it of items) {
        const cur = map.get(it.id) ?? 0;
        if (weight > cur) map.set(it.id, weight);
    }
}

function topSeeds(map: Map<string, number>, limit: number): SeedInfo[] {
    return Array.from(map.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([id, weight]) => ({ id, weight }));
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
    setMax(movieMap, movFavs as any, SEED_WEIGHT_FAVS);
    setMax(movieMap, movLike as any, SEED_WEIGHT_LIKE);

    const tvMap = new Map<string, number>();
    setMax(tvMap, tvFavs as any, SEED_WEIGHT_FAVS);
    setMax(tvMap, tvLike as any, SEED_WEIGHT_LIKE);
    setMax(tvMap, tvSig as any, SEED_WEIGHT_SIGUIENDO);

    const movieSeeds = topSeeds(movieMap, SEED_LIMIT);
    const tvSeeds = topSeeds(tvMap, SEED_LIMIT);

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
    };

    cache = { data, expires: now + TTL_MS };
    return data;
}

export function invalidatePersonalRecsCache() {
    cache = null;
}
