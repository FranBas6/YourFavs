/**
 * GET /api/summary?type=movie&ids=550,603,...
 *
 * Hidratación LIGERA de un lote de tmdbId → resumen para tarjetas (título,
 * póster, nota, año, géneros). Pensado para la app móvil: las listas viven en
 * Firestore como `{ id }` (sin datos TMDB), así que el cliente lee los IDs
 * directo de Firestore y pide aquí solo lo necesario para pintar el grid
 * (evita traer la ficha pesada de `/api/movie/[id]` por cada título).
 *
 * Réplica del patrón web (`personalPageHelper` hidrata cada id con TMDB en
 * lotes), pero recortado a lo que una card necesita. Público (solo datos TMDB,
 * sin nada personal). Convención de respuesta `{ ok, items }`.
 *
 *   type = movie | tv        (obligatorio)
 *   ids  = csv de tmdbId     (obligatorio, máx 60; se preserva el orden)
 *   language = es-ES (opc.)  se pasa a TMDB tal cual si viene
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl, backdropUrl } from '../../services/API/shared/tmdbClient';
import { getGenreName } from '../../utils/constants/genres';

export const prerender = false;

const MAX_IDS = 60;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

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
 * Exportado para reusarlo desde `/api/catalog`.
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

export const GET: APIRoute = async ({ url }) => {
    const type = url.searchParams.get('type');
    if (type !== 'movie' && type !== 'tv') {
        return json({ ok: false, error: 'type inválido (movie|tv)' }, 400);
    }

    const idsParam = url.searchParams.get('ids') ?? '';
    const ids = idsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);

    if (ids.length === 0) return json({ ok: true, items: [] });
    if (ids.length > MAX_IDS) {
        return json({ ok: false, error: `demasiados ids (máx ${MAX_IDS})` }, 400);
    }

    const language = url.searchParams.get('language') || undefined;
    const params = language ? { language } : {};

    try {
        // Hidratación concurrente por id; un fallo aislado no tumba el lote.
        const items = await Promise.all(
            ids.map((id) =>
                tmdbFetch<any>(`/${type}/${id}`, params)
                    .then((raw) => toItem(raw, type))
                    .catch(() => null),
            ),
        );
        return json({ ok: true, items: items.filter(Boolean) });
    } catch (err) {
        console.error('[api/summary GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo cargar el resumen.' }, 500);
    }
};
