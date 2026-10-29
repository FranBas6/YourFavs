import { getSeriesSiguiendo, getWatchedProgress } from '../../BD/series/yourfavsSerie';
import { fetchSerieDetails } from './tmdbSeries';
import { getEpisodesBySeasonNumber } from './InfoSeries';
import { processBatch } from '../../../utils/processBatch';
import type { WatchedProgress } from '../../../types/DbSerie';

/**
 * "Siguiente episodio a ver": el PRIMER episodio NO visto y ya emitido de cada
 * serie en seguimiento (no `last_watched + 1`: si hay huecos, manda el hueco).
 *
 * Coste: el doc de WatchedEpisodes ya dice cuántos episodios hay vistos por
 * temporada; comparándolo con `episode_count` del detalle TMDB localizamos la
 * primera temporada con hueco SIN pedirla → exactamente 1 fetch de temporada
 * por serie (`/tv/{id}/season/{n}`).
 */
export interface NextEpisodeItem {
    id: number;
    name: string;
    poster_path: string | null;
    /** Still del episodio (w300); null → fallback a poster/placeholder. */
    still_path: string | null;
    next_season: number;
    next_episode: number;
    next_episode_name: string;
    air_date: string | null;
    /** `episode_type` de TMDB («finale», «mid_season»…) para marcar finales (B2b). */
    episode_type?: string | null;
    /** Nota TMDB del episodio (1 decimal) o null si no tiene votos. */
    vote_average: number | null;
    overview: string;
    /** Progreso de la serie (episodios regulares) para la barra. */
    watched_count: number;
    total_count: number;
    /** last_watched.watched_at — para ordenar el panel. */
    watched_at: string;
}

type SeasonRef = { season_number: number; episode_count: number };

/** Temporadas regulares (sin especiales) ordenadas. */
function regularSeasons(detail: any): SeasonRef[] {
    return ((detail?.seasons || []) as SeasonRef[])
        .filter((s) => s.season_number > 0 && (s.episode_count || 0) > 0)
        .sort((a, b) => a.season_number - b.season_number);
}

function hasAired(airDate: string | null | undefined): boolean {
    return !!airDate && new Date(airDate + 'T23:59:59') <= new Date();
}

/**
 * Núcleo compartido (SSR del panel + endpoint de refetch): dado el detalle
 * TMDB y el progreso, devuelve el primer episodio no visto y emitido, o null
 * (serie al día / sin nada emitido pendiente).
 */
export async function computeNextEpisode(
    serieId: string,
    detail: any,
    progress: WatchedProgress,
): Promise<NextEpisodeItem | null> {
    const seasons = regularSeasons(detail);
    if (seasons.length === 0) return null;

    const watched = (progress.watched_episodes || []).filter((e) => e.season > 0);
    const watchedSet = new Set(watched.map((e) => `${e.season}-${e.episode}`));
    const bySeason: Record<number, number> = {};
    for (const e of watched) bySeason[e.season] = (bySeason[e.season] || 0) + 1;

    const totalCount = seasons.reduce((sum, s) => sum + s.episode_count, 0);

    // Primera temporada con hueco: menos vistos que episodios anunciados.
    const gapSeason = seasons.find((s) => (bySeason[s.season_number] || 0) < s.episode_count);
    if (!gapSeason) return null; // todo visto

    const episodes = await getEpisodesBySeasonNumber(serieId, gapSeason.season_number);
    const next = episodes
        .slice()
        .sort((a: any, b: any) => a.episode_number - b.episode_number)
        .find((ep: any) => !watchedSet.has(`${gapSeason.season_number}-${ep.episode_number}`));

    // El primer hueco aún no se ha emitido → la serie está al día.
    if (!next || !hasAired(next.air_date)) return null;

    return {
        id: Number(serieId),
        name: detail.name,
        poster_path: detail.poster_path ?? null,
        still_path: next.still_path ?? null,
        next_season: gapSeason.season_number,
        next_episode: next.episode_number,
        next_episode_name: next.name || `Episodio ${next.episode_number}`,
        air_date: next.air_date ?? null,
        episode_type: next.episode_type ?? null,
        vote_average: next.vote_average && next.vote_count > 0
            ? Math.round(next.vote_average * 10) / 10
            : null,
        overview: next.overview || '',
        watched_count: watched.length,
        total_count: totalCount,
        watched_at: progress.last_watched?.watched_at || '',
    };
}

/** Para el endpoint de refetch: una serie suelta (carga detalle + progreso). */
export async function getNextEpisode(serieId: string): Promise<NextEpisodeItem | null> {
    const [detail, progress] = await Promise.all([
        fetchSerieDetails(serieId),
        getWatchedProgress(serieId),
    ]);
    if (!detail || !progress?.last_watched) return null;
    return computeNextEpisode(serieId, detail, progress);
}

/**
 * Panel "Continuar viendo": TODAS las series en seguimiento CON progreso,
 * ordenadas por última actividad. Sin límite (como antes): el panel solo lo
 * acotan los filtros reales — serie al día / siguiente episodio sin emitir.
 * Coste: 1 detalle + 1 temporada por serie en seguimiento con progreso.
 */
export async function getNextEpisodesData(): Promise<NextEpisodeItem[]> {
    const ids = (await getSeriesSiguiendo()).map((s: any) => String(s.id));
    if (ids.length === 0) return [];

    const progress = await Promise.all(ids.map((id) => getWatchedProgress(id)));

    const candidates = ids
        .map((id, i) => ({ id, progress: progress[i] }))
        .filter((c): c is { id: string; progress: WatchedProgress } => !!c.progress?.last_watched)
        .sort((a, b) =>
            new Date(b.progress.last_watched!.watched_at).getTime() -
            new Date(a.progress.last_watched!.watched_at).getTime()
        );

    if (candidates.length === 0) return [];

    const items = await processBatch(
        candidates,
        async (c) => {
            try {
                const detail = await fetchSerieDetails(c.id);
                if (!detail) return null;
                return await computeNextEpisode(c.id, detail, c.progress);
            } catch {
                return null;
            }
        },
        10
    );

    return items.filter((x): x is NextEpisodeItem => x !== null);
}
