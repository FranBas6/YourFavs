import { getSeriesSiguiendo, getWatchedProgress } from '../../BD/series/yourfavsSerie';
import { fetchSerieDetails } from './tmdbSeries';
import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';

export interface ContinueWatchingItem {
    id: number;
    name: string;
    poster_path: string | null;
    next_season: number;
    next_episode: number;
    next_episode_name: string;
    watched_at: string;
}

/**
 * Devuelve las series siguiendo con progreso (last_watched), calculando el
 * siguiente episodio a ver. Excluye series sin progreso y series cuyo
 * last_watched es ya el finale (nada pendiente).
 *
 * Orden: por watched_at descendente (última vista arriba).
 */
export async function getContinueWatchingData(): Promise<ContinueWatchingItem[]> {
    const ids = (await getSeriesSiguiendo()).map((s: any) => String(s.id));
    if (ids.length === 0) return [];

    const [progress, details] = await Promise.all([
        Promise.all(ids.map((id) => getWatchedProgress(id))),
        processBatch(ids, (id) => fetchSerieDetails(id), 10),
    ]);

    const candidates: Array<{
        id: string;
        detail: any;
        nextSeason: number;
        nextEpisode: number;
        watched_at: string;
    }> = [];

    ids.forEach((id, i) => {
        const p = progress[i];
        const d = details[i];
        if (!p?.last_watched || !d) return;

        const last = p.last_watched;
        const totalSeasons = d.number_of_seasons ?? 0;
        const seasons = d.seasons || [];

        const currentSeason = seasons.find((s: any) => s.season_number === last.season);
        const currentEpCount = currentSeason?.episode_count ?? 0;

        let nextSeason: number;
        let nextEpisode: number;

        if (last.episode < currentEpCount) {
            nextSeason = last.season;
            nextEpisode = last.episode + 1;
        } else {
            nextSeason = last.season + 1;
            nextEpisode = 1;
        }

        if (nextSeason > totalSeasons || nextSeason < 1) return;
        const nextSeasonInfo = seasons.find((s: any) => s.season_number === nextSeason);
        if (!nextSeasonInfo || (nextSeasonInfo.episode_count ?? 0) === 0) return;

        candidates.push({
            id,
            detail: d,
            nextSeason,
            nextEpisode,
            watched_at: last.watched_at,
        });
    });

    if (candidates.length === 0) return [];

    const items = await processBatch(
        candidates,
        async (c) => {
            try {
                const season = await tmdbFetch<{ episodes?: any[] }>(`/tv/${c.id}/season/${c.nextSeason}`);
                const ep = (season.episodes || []).find((e: any) => e.episode_number === c.nextEpisode);
                // Ocultar si el episodio aún no se ha estrenado (TMDB anuncia capítulos futuros con air_date).
                if (!ep?.air_date || new Date(ep.air_date + 'T23:59:59') > new Date()) return null;
                return {
                    id: Number(c.id),
                    name: c.detail.name,
                    poster_path: c.detail.poster_path,
                    next_season: c.nextSeason,
                    next_episode: c.nextEpisode,
                    next_episode_name: ep?.name || `Episodio ${c.nextEpisode}`,
                    watched_at: c.watched_at,
                } as ContinueWatchingItem;
            } catch {
                return null;
            }
        },
        10
    );

    return items
        .filter((x): x is ContinueWatchingItem => x !== null)
        .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
}
