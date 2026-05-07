import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getFirebaseTimestamp } from './constants/helpers/media-helpers';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
    getMovieFav, getMoviesPendientes, getMoviesVistas, getLikedMovies, getMoviesVerPronto
} from '../services/BD/movies/yourfavsMovie';
import {
    getSerieFav, getSeriesPendientes, getSeriesVistas, getSeriesSiguiendo,
    getLikedSeries, getSeriesVerPronto
} from '../services/BD/series/yourfavsSerie';

const TTL_MS = 60 * 60 * 1000;
const FALLBACK_EPISODE_RUNTIME = 45;

export interface ItemShowcase {
    id: string;
    kind: 'movie' | 'tv';
    title: string;
    poster_path: string;
    tmdb_rating: number;
    user_rating?: number;
    addedAt: number;
}

export interface SeriesEpsRanking {
    id: string;
    title: string;
    poster_path: string;
    episodesWatched: number;
}

export interface YearStats {
    year: number;
    moviesAdded: number;
    seriesAdded: number;
    episodesWatched: number;
    totalHours: number;
    topGenres: { id: number; count: number }[];
    activeMonth: { month: number; count: number } | null;
    activeWeekday: { weekday: number; count: number } | null;
    monthlyBreakdown: number[];
    heatmap: { dayKey: string; count: number }[];
    byDecade: { decade: string; count: number }[];
    byCollection: { key: string; label: string; count: number }[];
    byLanguage: { code: string; count: number }[];
    showcase: {
        bestUserRated: ItemShowcase | null;
        bestTmdb: ItemShowcase | null;
        firstOfYear: ItemShowcase | null;
        lastOfYear: ItemShowcase | null;
        topSeries: SeriesEpsRanking[];
    };
    comparison: {
        moviesDelta: number | null;
        seriesDelta: number | null;
        episodesDelta: number | null;
    };
    availableYears: number[];
    hasData: boolean;
}

const cache = new Map<number, { data: YearStats; expires: number }>();

const COLLECTION_LABELS: Record<string, string> = {
    favs: 'Favoritos', siguiendo: 'Siguiendo', like: 'Me gusta',
    vistos: 'Vistos', pendientes: 'Pendientes', verpronto: 'Pronto',
};

function yearOf(timestamp: number): number { return new Date(timestamp).getFullYear(); }
function monthOf(timestamp: number): number { return new Date(timestamp).getMonth(); }
function weekdayOf(timestamp: number): number { return new Date(timestamp).getDay(); }
function dayKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function decadeOf(year: number): string {
    if (!year || year < 1900) return 'Desconocido';
    return `${Math.floor(year / 10) * 10}s`;
}

interface RawItem {
    id: string;
    kind: 'movie' | 'tv';
    addedAt: number;
    collections: Set<string>;
    user_rating?: number;
}

function buildRawMap(groups: { items: any[]; key: string }[]): Map<string, RawItem> {
    const map = new Map<string, RawItem>();
    for (const { items, key } of groups) {
        for (const item of items) {
            const t = getFirebaseTimestamp(item.added_at);
            if (!t) continue;
            const cur = map.get(item.id);
            if (cur) {
                cur.collections.add(key);
                if (t < cur.addedAt) cur.addedAt = t;
                if (item.rating && (!cur.user_rating || item.rating > cur.user_rating)) {
                    cur.user_rating = item.rating;
                }
            } else {
                map.set(item.id, {
                    id: item.id,
                    kind: 'movie',
                    addedAt: t,
                    collections: new Set([key]),
                    user_rating: item.rating || undefined,
                });
            }
        }
    }
    return map;
}

export async function calculateYearStats(year: number): Promise<YearStats> {
    const now = Date.now();
    const cached = cache.get(year);
    if (cached && cached.expires > now) return cached.data;

    const [movFavs, movPend, movVistos, movLike, movVerPronto] = await Promise.all([
        getMovieFav(), getMoviesPendientes(), getMoviesVistas(), getLikedMovies(), getMoviesVerPronto()
    ]);
    const [tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto] = await Promise.all([
        getSerieFav(), getSeriesPendientes(), getSeriesVistas(),
        getSeriesSiguiendo(), getLikedSeries(), getSeriesVerPronto()
    ]);

    const movieMap = buildRawMap([
        { items: movFavs, key: 'favs' },
        { items: movLike, key: 'like' },
        { items: movVistos, key: 'vistos' },
        { items: movPend, key: 'pendientes' },
        { items: movVerPronto, key: 'verpronto' },
    ]);
    for (const v of movieMap.values()) v.kind = 'movie';

    const tvMap = buildRawMap([
        { items: tvFavs, key: 'favs' },
        { items: tvSig, key: 'siguiendo' },
        { items: tvLike, key: 'like' },
        { items: tvVistos, key: 'vistos' },
        { items: tvPend, key: 'pendientes' },
        { items: tvVerPronto, key: 'verpronto' },
    ]);
    for (const v of tvMap.values()) v.kind = 'tv';

    const allYears = new Set<number>();
    const allRaw = [...movieMap.values(), ...tvMap.values()];
    for (const r of allRaw) allYears.add(yearOf(r.addedAt));

    const itemsOfYear = allRaw.filter(r => yearOf(r.addedAt) === year);
    const itemsOfPrev = allRaw.filter(r => yearOf(r.addedAt) === year - 1);

    // Fetch detalles TMDB para items del año
    const enriched = await processBatch(
        itemsOfYear,
        async (item: RawItem) => {
            try {
                const path = item.kind === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
                const d: any = await tmdbFetch<any>(path);
                const releaseStr = item.kind === 'movie' ? d?.release_date : d?.first_air_date;
                const releaseYear = releaseStr ? Number(releaseStr.slice(0, 4)) : 0;
                const epRuntime = Array.isArray(d?.episode_run_time) && d.episode_run_time.length > 0
                    ? d.episode_run_time[0] : FALLBACK_EPISODE_RUNTIME;
                return {
                    raw: item,
                    title: (item.kind === 'movie' ? d?.title : d?.name) || '',
                    poster_path: d?.poster_path || '',
                    tmdb_rating: d?.vote_average || 0,
                    runtime: d?.runtime || 0,
                    episode_runtime: epRuntime,
                    release_year: releaseYear,
                    original_language: d?.original_language || '',
                    genres: ((d?.genres || []) as any[]).map(g => g.id as number),
                };
            } catch {
                return {
                    raw: item, title: '', poster_path: '', tmdb_rating: 0,
                    runtime: 0, episode_runtime: FALLBACK_EPISODE_RUNTIME,
                    release_year: 0, original_language: '', genres: [] as number[],
                };
            }
        },
        10
    );

    // Monthly breakdown + active weekday
    const monthlyBreakdown = new Array(12).fill(0);
    const weekdayBreakdown = new Array(7).fill(0);
    for (const e of enriched) {
        monthlyBreakdown[monthOf(e.raw.addedAt)]++;
        weekdayBreakdown[weekdayOf(e.raw.addedAt)]++;
    }
    let activeMonth: { month: number; count: number } | null = null;
    for (let m = 0; m < 12; m++) {
        if (!activeMonth || monthlyBreakdown[m] > activeMonth.count) {
            activeMonth = { month: m, count: monthlyBreakdown[m] };
        }
    }
    if (activeMonth && activeMonth.count === 0) activeMonth = null;

    let activeWeekday: { weekday: number; count: number } | null = null;
    for (let w = 0; w < 7; w++) {
        if (!activeWeekday || weekdayBreakdown[w] > activeWeekday.count) {
            activeWeekday = { weekday: w, count: weekdayBreakdown[w] };
        }
    }
    if (activeWeekday && activeWeekday.count === 0) activeWeekday = null;

    // Top géneros
    const genreCount: Record<number, number> = {};
    for (const e of enriched) for (const g of e.genres) genreCount[g] = (genreCount[g] || 0) + 1;
    const topGenres = Object.entries(genreCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, count]) => ({ id: Number(id), count }));

    // By decade
    const decadeCount: Record<string, number> = {};
    for (const e of enriched) {
        const dec = decadeOf(e.release_year);
        decadeCount[dec] = (decadeCount[dec] || 0) + 1;
    }
    const byDecade = Object.entries(decadeCount)
        .sort(([a], [b]) => (b === 'Desconocido' ? -1 : a === 'Desconocido' ? 1 : Number(b.replace('s', '')) - Number(a.replace('s', ''))))
        .map(([decade, count]) => ({ decade, count }));

    // By collection
    const collCount: Record<string, number> = {};
    for (const e of enriched) {
        for (const c of e.raw.collections) collCount[c] = (collCount[c] || 0) + 1;
    }
    const byCollection = Object.entries(collCount)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => ({ key, label: COLLECTION_LABELS[key] || key, count }));

    // By language
    const langCount: Record<string, number> = {};
    for (const e of enriched) {
        if (e.original_language) langCount[e.original_language] = (langCount[e.original_language] || 0) + 1;
    }
    const byLanguage = Object.entries(langCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }));

    // Watched episodes — heatmap + count + top series + horas vistas en eps + episodios año anterior
    const heatmapMap = new Map<string, number>();
    const seriesEpsCount = new Map<string, number>();
    let episodesWatched = 0;
    let episodesPrev = 0;
    let hoursFromEpisodes = 0;
    try {
        const snap = await getDocs(collection(db, 'WatchedEpisodes'));
        for (const docSnap of snap.docs) {
            const data = docSnap.data() as { id?: string; watched_episodes?: { watched_at?: string }[] };
            const serieId = data.id || docSnap.id;
            for (const ep of data.watched_episodes || []) {
                if (!ep.watched_at) continue;
                const d = new Date(ep.watched_at);
                if (isNaN(d.getTime())) continue;
                const y = d.getFullYear();
                if (y === year) {
                    episodesWatched++;
                    const k = dayKey(d);
                    heatmapMap.set(k, (heatmapMap.get(k) || 0) + 1);
                    seriesEpsCount.set(serieId, (seriesEpsCount.get(serieId) || 0) + 1);
                } else if (y === year - 1) {
                    episodesPrev++;
                }
            }
        }
    } catch (error) {
        console.error('Error leyendo WatchedEpisodes:', error);
    }
    const heatmap = Array.from(heatmapMap.entries()).map(([dayKey, count]) => ({ dayKey, count }));

    // Horas: runtime de movies del año + (eps × episode_runtime medio por serie del año)
    let hoursFromMovies = 0;
    const enrichedById = new Map<string, typeof enriched[number]>();
    for (const e of enriched) {
        enrichedById.set(e.raw.id, e);
        if (e.raw.kind === 'movie' && e.runtime > 0) hoursFromMovies += e.runtime;
    }
    // Para series, usamos eps vistos en el año × runtime medio (de los detalles que ya tenemos)
    for (const [serieId, eps] of seriesEpsCount.entries()) {
        const detail = enrichedById.get(serieId);
        const runtime = detail?.episode_runtime || FALLBACK_EPISODE_RUNTIME;
        hoursFromEpisodes += eps * runtime;
    }
    const totalHours = Math.round((hoursFromMovies + hoursFromEpisodes) / 60);

    // Top series por eps vistos en el año (top 5)
    const topSeries: SeriesEpsRanking[] = Array.from(seriesEpsCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([serieId, eps]) => {
            const detail = enrichedById.get(serieId);
            return {
                id: serieId,
                title: detail?.title || `Serie ${serieId}`,
                poster_path: detail?.poster_path || '',
                episodesWatched: eps,
            };
        });

    // Showcase
    const toShowcase = (e: typeof enriched[number]): ItemShowcase => ({
        id: e.raw.id, kind: e.raw.kind, title: e.title,
        poster_path: e.poster_path, tmdb_rating: e.tmdb_rating,
        user_rating: e.raw.user_rating, addedAt: e.raw.addedAt,
    });
    const enrichedSorted = [...enriched].sort((a, b) => a.raw.addedAt - b.raw.addedAt);
    const enrichedWithUserRating = enriched.filter(e => e.raw.user_rating && e.raw.user_rating > 0);
    const bestUserRated = enrichedWithUserRating.length
        ? toShowcase([...enrichedWithUserRating].sort((a, b) => (b.raw.user_rating || 0) - (a.raw.user_rating || 0))[0])
        : null;
    const enrichedWithTmdb = enriched.filter(e => e.tmdb_rating > 0);
    const bestTmdb = enrichedWithTmdb.length
        ? toShowcase([...enrichedWithTmdb].sort((a, b) => b.tmdb_rating - a.tmdb_rating)[0])
        : null;
    const firstOfYear = enrichedSorted.length ? toShowcase(enrichedSorted[0]) : null;
    const lastOfYear = enrichedSorted.length ? toShowcase(enrichedSorted[enrichedSorted.length - 1]) : null;

    // Comparison
    const moviesPrev = itemsOfPrev.filter(r => r.kind === 'movie').length;
    const seriesPrev = itemsOfPrev.filter(r => r.kind === 'tv').length;
    const moviesAdded = itemsOfYear.filter(r => r.kind === 'movie').length;
    const seriesAdded = itemsOfYear.filter(r => r.kind === 'tv').length;
    const pctDelta = (cur: number, prev: number): number | null => {
        if (prev === 0) return cur > 0 ? null : null;
        return Math.round(((cur - prev) / prev) * 100);
    };

    const data: YearStats = {
        year,
        moviesAdded,
        seriesAdded,
        episodesWatched,
        totalHours,
        topGenres,
        activeMonth,
        activeWeekday,
        monthlyBreakdown,
        heatmap,
        byDecade,
        byCollection,
        byLanguage,
        showcase: { bestUserRated, bestTmdb, firstOfYear, lastOfYear, topSeries },
        comparison: {
            moviesDelta: pctDelta(moviesAdded, moviesPrev),
            seriesDelta: pctDelta(seriesAdded, seriesPrev),
            episodesDelta: pctDelta(episodesWatched, episodesPrev),
        },
        availableYears: Array.from(allYears).sort((a, b) => b - a),
        hasData: moviesAdded + seriesAdded + episodesWatched > 0,
    };

    cache.set(year, { data, expires: now + TTL_MS });
    return data;
}

export function invalidateYearStatsCache() { cache.clear(); }
