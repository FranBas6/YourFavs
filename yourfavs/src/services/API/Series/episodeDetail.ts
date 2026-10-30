/**
 * Ficha de episodio (TMDB D4, handoff `docs/design_handoff_episodio`). Dos llamadas a la vez:
 *
 *   · `/tv/{id}?append_to_response=season/{n},season/{n±1}` → la cabecera (nombre, póster, fondo,
 *     estado) y los episodios de la temporada y de sus vecinas, para la tira y para anterior /
 *     siguiente entre temporadas. Una temporada que no existe, TMDB la omite sin error.
 *   · `/tv/{id}/season/{n}/episode/{m}?append_to_response=images,videos,credits,external_ids` → el
 *     episodio entero. Fotogramas y vídeos con `include_*_language` (si no, el idioma del perfil los
 *     filtra y casi nunca queda ninguno).
 *
 * Sin caché propia: los datos de TMDB se muestran siempre como TMDB los da (regla de Fran, C4).
 */
import { tmdbFetch } from '../shared/tmdbClient';
import { getCurrentLanguage } from '../../BD/shared/userScope';

/** Lo mínimo de un episodio para la tira y para anterior / siguiente. */
export interface EpisodeRef {
    season: number;
    episode: number;
    name: string;
    still_path: string | null;
    air_date: string | null;
    episode_type: string | null;
}

export interface EpisodeDetail {
    series: {
        id: number;
        name: string;
        poster_path: string | null;
        backdrop_path: string | null;
        status: string;
        genres: { id: number; name: string }[];
        origin_country: string[];
        number_of_episodes: number;
        /** Temporadas con episodios (sin las vacías que TMDB anuncia), para el selector. */
        seasons: { season_number: number; name: string; episode_count: number }[];
        last_season: number;
    };
    /** La respuesta de TMDB del episodio (con credits, images, videos, external_ids). */
    episode: any;
    /** Episodios de la temporada, en orden. */
    seasonEpisodes: EpisodeRef[];
    prev: EpisodeRef | null;
    next: EpisodeRef | null;
}

function toRef(season: number, e: any): EpisodeRef {
    return {
        season,
        episode: Number(e.episode_number),
        name: String(e.name ?? ''),
        still_path: e.still_path ?? null,
        air_date: e.air_date || null,
        episode_type: e.episode_type ?? null,
    };
}

const episodesOf = (s: any, n: number): EpisodeRef[] =>
    (s?.episodes ?? []).map((e: any) => toRef(n, e)).sort((a: EpisodeRef, b: EpisodeRef) => a.episode - b.episode);

/**
 * Anterior y siguiente. Dentro de la temporada, el de al lado; en los bordes, el último de la
 * anterior o el primero de la siguiente. La temporada 0 (especiales) no se mezcla con las demás:
 * sus episodios solo enlazan entre sí, y la T1 no enlaza hacia la T0.
 */
export function neighbours(
    season: number,
    episode: number,
    current: EpisodeRef[],
    prevSeason: EpisodeRef[],
    nextSeason: EpisodeRef[],
): { prev: EpisodeRef | null; next: EpisodeRef | null } {
    const i = current.findIndex((e) => e.episode === episode);
    const prev = i > 0 ? current[i - 1] : (season > 1 ? prevSeason.at(-1) ?? null : null);
    const next = i >= 0 && i < current.length - 1 ? current[i + 1] : (season > 0 ? nextSeason[0] ?? null : null);
    return { prev, next };
}

/** No existe el episodio: lo que la 404 necesita para ofrecer «Ver la serie» y «Ver la temporada». */
export interface EpisodeMissing {
    missing: true;
    series: { id: number; name: string } | null;
    seasonExists: boolean;
}

/** El episodio con todo lo necesario para su ficha, o qué falta si no existe. */
export async function getEpisodeDetail(seriesId: number, season: number, episode: number): Promise<EpisodeDetail | EpisodeMissing> {
    const seasonsWanted = [season];
    if (season > 1) seasonsWanted.push(season - 1);
    if (season > 0) seasonsWanted.push(season + 1);
    const lang = getCurrentLanguage().split('-')[0];

    const [series, ep] = await Promise.all([
        tmdbFetch<any>(`/tv/${seriesId}`, { append_to_response: seasonsWanted.map((n) => `season/${n}`).join(',') }).catch(() => null),
        tmdbFetch<any>(`/tv/${seriesId}/season/${season}/episode/${episode}`, {
            append_to_response: 'images,videos,credits,external_ids',
            include_image_language: `${lang},en,null`,
            include_video_language: `${lang},en,null`,
        }).catch(() => null),
    ]);
    const current = episodesOf(series?.[`season/${season}`], season);
    if (!series?.id || !ep?.id || !current.some((e) => e.episode === episode)) {
        return {
            missing: true,
            series: series?.id ? { id: series.id, name: series.name ?? '' } : null,
            seasonExists: current.length > 0,
        };
    }
    const { prev, next } = neighbours(
        season, episode, current,
        episodesOf(series[`season/${season - 1}`], season - 1),
        episodesOf(series[`season/${season + 1}`], season + 1),
    );

    const seasons = (series.seasons ?? [])
        .filter((s: any) => Number(s.episode_count) > 0)
        .map((s: any) => ({ season_number: Number(s.season_number), name: String(s.name ?? ''), episode_count: Number(s.episode_count) }));

    return {
        series: {
            id: series.id,
            name: series.name ?? '',
            poster_path: series.poster_path ?? null,
            backdrop_path: series.backdrop_path ?? null,
            status: series.status ?? '',
            genres: series.genres ?? [],
            origin_country: series.origin_country ?? [],
            number_of_episodes: Number(series.number_of_episodes) || 0,
            seasons,
            last_season: Math.max(0, ...seasons.map((s: { season_number: number }) => s.season_number)),
        },
        episode: ep,
        seasonEpisodes: current,
        prev,
        next,
    };
}
