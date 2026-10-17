/**
 * Resumen de card a partir de un objeto de TMDB (`SummaryItem` + `toItem`).
 *
 * Vivía dentro de la ruta `src/pages/api/summary.ts` y de ahí lo importaban otras rutas. Sale a
 * `services/` porque a partir del perfil público también lo necesitan los servicios (hidratar
 * los títulos de otra persona), y un servicio no debe depender de un archivo de página. La ruta
 * lo sigue re-exportando, así que `catalog`, `search/cast` y `actor/[id]` no cambian.
 */
import { posterUrl, backdropUrl } from './tmdbClient';
import { getGenreName } from '../../../utils/constants/genres';

export interface SummaryItem {
    id: number;
    media_type: 'movie' | 'tv';
    /** title (movie) o name (tv), en el idioma pedido. */
    title: string;
    /** poster_path crudo (para reusar a otros tamaños), o null. */
    poster_path: string | null;
    /** URL w500 del póster, o null (el cliente pinta placeholder). */
    image: string | null;
    /** backdrop_path crudo, o null. */
    backdrop_path: string | null;
    /** URL w780 del backdrop (para el hero de la Home), o null. */
    backdrop: string | null;
    /** Sinopsis corta (para la card), o null. */
    overview: string | null;
    /** vote_average a 1 decimal, o null si no hay votos. */
    rating: number | null;
    /** Fecha de estreno completa (movie: release_date · tv: first_air_date), o null. */
    release_date: string | null;
    /** Año de estreno, o null. */
    year: string | null;
    /** Nombres de género ya localizados. */
    genres: string[];
}

/**
 * Normaliza un objeto TMDB (detalle o item de lista) al resumen de card.
 * Acepta tanto `genres:[{id,name}]` (detalle) como `genre_ids:[number]` (listas).
 */
export function toItem(raw: any, type: 'movie' | 'tv'): SummaryItem | null {
    if (!raw || !raw.id) return null;
    const title = type === 'movie' ? raw.title : raw.name;
    if (!title) return null;
    const date = type === 'movie' ? raw.release_date : raw.first_air_date;
    const year = typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : null;
    const vote = typeof raw.vote_average === 'number' && raw.vote_average > 0
        ? Math.round(raw.vote_average * 10) / 10
        : null;
    const genres: string[] = Array.isArray(raw.genres)
        ? raw.genres.map((g: any) => g?.name).filter(Boolean)
        : Array.isArray(raw.genre_ids)
            ? raw.genre_ids.map((id: number) => getGenreName(id)).filter(Boolean)
            : [];
    return {
        id: raw.id,
        media_type: type,
        title,
        poster_path: raw.poster_path ?? null,
        image: raw.poster_path ? posterUrl(raw.poster_path, 'w500') : null,
        backdrop_path: raw.backdrop_path ?? null,
        backdrop: raw.backdrop_path ? backdropUrl(raw.backdrop_path, 'w780') : null,
        overview: raw.overview || null,
        rating: vote,
        release_date: typeof date === 'string' && date ? date : null,
        year,
        genres,
    };
}
