/**
 * Diario de visionado — ensamblado del mes (Fase L6).
 *
 * Lee las entradas de `WatchLog` (append-only) del mes y las enriquece por TMDB
 * (título/póster/duración) — el diario NO congela esos datos, igual que el resto
 * de páginas personales. Agrupa por día y calcula las estadísticas del mes.
 */
import { tmdbFetch, posterUrl } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';
import { getWatchLog } from '../../BD/lists/watchLog';

const FALLBACK_EPISODE_RUNTIME = 45;

export interface DiaryItem {
    id: string;                    // id de la entrada en WatchLog (para editar/borrar)
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;   // ya resuelto a URL (w185)
    season?: number;
    episode?: number;
    rewatch: boolean;
}
export interface DiaryDay { date: string; items: DiaryItem[]; }
export interface DiaryStats { movies: number; episodes: number; hours: number; rewatches: number; }
export interface DiaryMonth {
    year: number;
    month: number;
    days: DiaryDay[];
    stats: DiaryStats;
    today: string;
    total: number;
}

interface Detail { title: string; poster: string | null; runtime: number; episode_runtime: number; }

export async function getDiaryMonth(year: number, month: number): Promise<DiaryMonth> {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${year}-${mm}-01`;
    const to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    const today = new Date().toISOString().slice(0, 10);

    const entries = await getWatchLog({ from, to });
    if (entries.length === 0) {
        return { year, month, days: [], stats: { movies: 0, episodes: 0, hours: 0, rewatches: 0 }, today, total: 0 };
    }

    // Detalles TMDB únicos (un fetch por título distinto del mes).
    const uniq = new Map<string, { mt: 'movie' | 'tv'; id: number }>();
    for (const e of entries) uniq.set(`${e.media_type}:${e.tmdb_id}`, { mt: e.media_type, id: e.tmdb_id });

    const detailById = new Map<string, Detail>();
    await processBatch(Array.from(uniq.values()), async ({ mt, id }) => {
        const key = `${mt}:${id}`;
        try {
            const d: any = await tmdbFetch(`/${mt === 'movie' ? 'movie' : 'tv'}/${id}`);
            const epr = Array.isArray(d?.episode_run_time) && d.episode_run_time.length > 0
                ? d.episode_run_time[0] : FALLBACK_EPISODE_RUNTIME;
            detailById.set(key, {
                title: d?.title || d?.name || '—',
                poster: d?.poster_path ? posterUrl(d.poster_path, 'w185') : null,
                runtime: d?.runtime || 0,
                episode_runtime: epr,
            });
        } catch {
            detailById.set(key, { title: '—', poster: null, runtime: 0, episode_runtime: FALLBACK_EPISODE_RUNTIME });
        }
    }, 10);

    const dayMap = new Map<string, DiaryItem[]>();
    let movies = 0, episodes = 0, rewatches = 0, minutes = 0;

    for (const e of entries) {
        const det = detailById.get(`${e.media_type}:${e.tmdb_id}`);
        const item: DiaryItem = {
            id: e.id,
            media_type: e.media_type,
            tmdb_id: e.tmdb_id,
            title: det?.title || '—',
            poster_path: det?.poster || null,
            season: e.season,
            episode: e.episode,
            rewatch: !!e.rewatch,
        };
        if (!dayMap.has(e.watched_on)) dayMap.set(e.watched_on, []);
        dayMap.get(e.watched_on)!.push(item);

        if (e.rewatch) rewatches++;
        if (e.media_type === 'movie') { movies++; minutes += det?.runtime || 0; }
        else { episodes++; minutes += det?.episode_runtime || FALLBACK_EPISODE_RUNTIME; }
    }

    const days: DiaryDay[] = Array.from(dayMap.entries())
        .map(([date, items]) => ({ date, items }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        year, month, days,
        stats: { movies, episodes, hours: Math.round(minutes / 60), rewatches },
        today,
        total: entries.length,
    };
}
