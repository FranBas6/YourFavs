/**
 * "Estás viendo" — películas en el estado Viendo (Bloque 2), enriquecidas con los
 * datos de TMDB necesarios para la franja del Home (póster, título, año, nota).
 *
 * Los docs de MoviesViendo solo guardan { id, added_at }, así que resolvemos los
 * detalles por TMDB (processBatch, 5 en paralelo). Orden: empezadas más recientes
 * primero. Sin sesión → [].
 */
import { getMoviesViendo } from '../../BD/movies/yourfavsMovie';
import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';
import { getFirebaseTimestamp } from '../../../utils/constants/helpers/media-helpers';

export interface ViendoMovie {
    id: string;
    title: string;
    poster_path: string | null;
    vote_average: number | null;
    year: string;
    overview: string;
    runtime: number | null;
    started_at: number; // ms (para ordenar por recencia)
}

export async function getMoviesViendoDetailed(): Promise<ViendoMovie[]> {
    const list = await getMoviesViendo(); // [] si no hay sesión
    if (!list.length) return [];

    const detailed = await processBatch(
        list,
        async (m: any): Promise<ViendoMovie | null> => {
            try {
                const d = await tmdbFetch<any>(`/movie/${m.id}`);
                return {
                    id: String(m.id),
                    title: d?.title || '',
                    poster_path: d?.poster_path || null,
                    vote_average: typeof d?.vote_average === 'number' ? d.vote_average : null,
                    year: d?.release_date ? String(d.release_date).slice(0, 4) : '',
                    overview: d?.overview || '',
                    runtime: typeof d?.runtime === 'number' && d.runtime > 0 ? d.runtime : null,
                    started_at: getFirebaseTimestamp(m.added_at) || 0,
                };
            } catch {
                return null;
            }
        },
        5
    );

    return (detailed.filter(Boolean) as ViendoMovie[]).sort((a, b) => b.started_at - a.started_at);
}
