/**
 * Ficha de temporada (`/serie/{id}/t{n}`, handoff `docs/Temporada/design_handoff_temporada`). Dos
 * llamadas a la vez:
 *
 *   · `/tv/{id}` → la cabecera (nombre, póster, fondo, estado) y la lista de temporadas, con su póster,
 *     fecha y nº de episodios, para la navegación entre temporadas.
 *   · `/tv/{id}/season/{n}?append_to_response=aggregate_credits,images,videos` → la temporada entera:
 *     episodios (con equipo e invitados), reparto y equipo de la temporada con su nº de episodios,
 *     pósters y vídeos. Pósters y vídeos con `include_*_language` (si no, el idioma del perfil los
 *     filtra y casi nunca queda ninguno).
 *
 * Dónde verla va aparte (`getSeasonWatchProviders`, que ya tiene caché). TMDB solo tiene ese dato por
 * temporada en algunas series y países (*Los Simpson* T38 en España: vacío, aunque la serie está en
 * Disney+), así que `/tv/{id}` trae también el de la serie (`watch/providers`, sin llamada extra) para
 * usarlo cuando el de la temporada falte. Sin caché propia: los datos de
 * TMDB se muestran como TMDB los da (regla de Fran, C4), igual que la ficha de episodio.
 */
import { tmdbFetch } from '../shared/tmdbClient';
import { buildProviderLinksByCountry, buildProvidersByCountry } from '../shared/tmdbInfoService';
import { getCurrentLanguage } from '../../BD/shared/userScope';

/** Una temporada de la serie, lo justo para la navegación. */
export interface SeasonRef {
    season_number: number;
    name: string;
    episode_count: number;
    air_date: string | null;
    poster_path: string | null;
}

export interface SeasonDetail {
    series: {
        id: number;
        name: string;
        original_name: string;
        original_language: string;
        poster_path: string | null;
        backdrop_path: string | null;
        status: string;
        genres: { id: number; name: string }[];
        origin_country: string[];
        created_by: { id: number; name: string }[];
        number_of_episodes: number;
        /** Todas las temporadas que anuncia TMDB, también las que aún no tienen episodios. */
        seasons: SeasonRef[];
        /** La temporada más alta (sin contar los especiales). */
        last_season: number;
        /** Temporada del próximo episodio que TMDB anuncia (para «En emisión»), o null. */
        next_air_season: number | null;
        /** Dónde ver la serie entera, por país (respaldo del de la temporada). */
        providers: { providersByCountry: Record<string, any[]>; linkByCountry: Record<string, string> };
    };
    /** La respuesta de TMDB de la temporada (con aggregate_credits, images, videos). */
    season: any;
}

/** No existe la temporada: lo que la 404 necesita para ofrecer «Ver la serie». */
export interface SeasonMissing {
    missing: true;
    series: { id: number; name: string } | null;
}

export async function getSeasonDetail(seriesId: number, season: number): Promise<SeasonDetail | SeasonMissing> {
    const lang = getCurrentLanguage().split('-')[0];
    const [series, s] = await Promise.all([
        tmdbFetch<any>(`/tv/${seriesId}`, { append_to_response: 'watch/providers' }).catch(() => null),
        tmdbFetch<any>(`/tv/${seriesId}/season/${season}`, {
            append_to_response: 'aggregate_credits,images,videos',
            include_image_language: `${lang},en,null`,
            include_video_language: `${lang},en,null`,
        }).catch(() => null),
    ]);
    // Una temporada que TMDB no conoce da 404 en `/season/{n}`; también la descartamos si la serie no
    // la lista (TMDB a veces responde con una temporada vacía para números que no existen).
    const listed = (series?.seasons ?? []).some((x: any) => Number(x.season_number) === season);
    if (!series?.id || !s || !listed) {
        return { missing: true, series: series?.id ? { id: series.id, name: series.name ?? '' } : null };
    }

    const seasons: SeasonRef[] = (series.seasons ?? [])
        .map((x: any) => ({
            season_number: Number(x.season_number),
            name: String(x.name ?? ''),
            episode_count: Number(x.episode_count) || 0,
            air_date: x.air_date || null,
            poster_path: x.poster_path ?? null,
        }))
        .sort((a: SeasonRef, b: SeasonRef) => a.season_number - b.season_number);

    s.episodes = [...(s.episodes ?? [])].sort((a: any, b: any) => Number(a.episode_number) - Number(b.episode_number));

    return {
        series: {
            id: series.id,
            name: series.name ?? '',
            original_name: series.original_name ?? '',
            original_language: series.original_language ?? '',
            poster_path: series.poster_path ?? null,
            backdrop_path: series.backdrop_path ?? null,
            status: series.status ?? '',
            genres: series.genres ?? [],
            origin_country: series.origin_country ?? [],
            created_by: (series.created_by ?? []).map((c: any) => ({ id: c.id, name: c.name ?? '' })),
            number_of_episodes: Number(series.number_of_episodes) || 0,
            seasons,
            last_season: Math.max(0, ...seasons.map((x) => x.season_number)),
            next_air_season: series.next_episode_to_air ? Number(series.next_episode_to_air.season_number) : null,
            providers: {
                providersByCountry: buildProvidersByCountry(series['watch/providers']?.results ?? {}),
                linkByCountry: buildProviderLinksByCountry(series['watch/providers']?.results ?? {}),
            },
        },
        season: s,
    };
}
