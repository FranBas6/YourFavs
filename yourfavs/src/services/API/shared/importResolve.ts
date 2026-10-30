/**
 * De los ids de otras apps a títulos de TMDB (TMDB D3). IMDb: `/find/{tt}?external_source=imdb_id`
 * es exacto, una llamada por título y ya trae título, año y póster en tu idioma, así que la vista
 * previa y la importación no necesitan nada más de TMDB.
 */
import { tmdbFetch } from './tmdbClient';
import { processBatch } from '../../../utils/processBatch';

/** Llamadas a la vez dentro de un lote. Un lote de 50 tarda ~1-2 s; TMDB aguanta ~50/s. */
const CONCURRENCY = 25;

export interface ResolvedTitle {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    year: number | null;
    poster_path: string | null;
}

interface FindResponse {
    movie_results?: { id: number; title?: string; release_date?: string; poster_path?: string | null }[];
    tv_results?: { id: number; name?: string; first_air_date?: string; poster_path?: string | null }[];
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/**
 * Cada `tt…` → su título de TMDB, `null` si TMDB no lo tiene (o es un episodio) o `'error'` si la
 * llamada falló (el navegador lo reintenta: no es lo mismo que «no encontrado»). `type` decide solo
 * si TMDB devolviera película y serie a la vez para el mismo id.
 */
export async function resolveImdbIds(rows: { imdb: string; type: 'movie' | 'tv' }[]): Promise<(ResolvedTitle | null | 'error')[]> {
    return processBatch(rows, async ({ imdb, type }): Promise<ResolvedTitle | null | 'error'> => {
        try {
            const r = await tmdbFetch<FindResponse>(`/find/${imdb}`, { external_source: 'imdb_id' });
            const movie = r.movie_results?.[0];
            const tv = r.tv_results?.[0];
            const pick = type === 'tv' ? (tv ? 'tv' : movie ? 'movie' : null) : (movie ? 'movie' : tv ? 'tv' : null);
            if (pick === 'movie' && movie) {
                return { media_type: 'movie', tmdb_id: movie.id, title: movie.title ?? '', year: yearOf(movie.release_date), poster_path: movie.poster_path ?? null };
            }
            if (pick === 'tv' && tv) {
                return { media_type: 'tv', tmdb_id: tv.id, title: tv.name ?? '', year: yearOf(tv.first_air_date), poster_path: tv.poster_path ?? null };
            }
            return null;
        } catch (error) {
            console.error(`[import] /find ${imdb}:`, (error as Error).message);
            return 'error' as const;
        }
    }, CONCURRENCY);
}
