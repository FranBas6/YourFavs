/**
 * GET /api/search/multi?q=...
 *
 * Búsqueda instantánea para el command palette (⌘K): UNA sola llamada a
 * TMDB /search/multi (películas + series + personas en la misma respuesta),
 * con el payload recortado en servidor a lo que el palette necesita.
 *
 * La búsqueda completa (/catalogo/busqueda, 3 endpoints + loadAllPages) se
 * mantiene como "Ver todos los resultados" — esto es solo el camino rápido.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl } from '../../../services/API/shared/tmdbClient';
import { DEPARTMENT_ES } from '../../../utils/constants/helpers/team-helpers';

export const prerender = false;

export interface MultiSearchItem {
    id: number;
    media_type: 'movie' | 'tv' | 'person';
    title: string;
    /** Año (movie/tv) o departamento (person), ya en español. */
    subtitle: string;
    /** URL w92 del póster/avatar, o null (el cliente pinta placeholder). */
    image: string | null;
    /** poster_path/profile_path crudo (para reusar a otros tamaños), o null. */
    poster_path: string | null;
    /** vote_average a 1 decimal; null para personas o sin votos. */
    rating: number | null;
    /** Ruta interna: /movie/:id, /serie/:id o /actor/:id. */
    href: string;
}

const MAX_PER_GROUP = 8;


function toItem(raw: any): MultiSearchItem | null {
    const type = raw?.media_type;
    if (type !== 'movie' && type !== 'tv' && type !== 'person') return null;

    const title = type === 'movie' ? raw.title : raw.name;
    if (!title) return null;

    if (type === 'person') {
        // B5: «Conocido por» — TMDB manda en `known_for` sus títulos más conocidos (ya en tu idioma).
        const knownFor = (raw.known_for || []).map((k: any) => k.title || k.name).filter(Boolean).slice(0, 2).join(', ');
        const dept = DEPARTMENT_ES[raw.known_for_department] || raw.known_for_department || 'Persona';
        return {
            id: raw.id,
            media_type: 'person',
            title,
            subtitle: knownFor ? `${dept} · ${knownFor}` : dept,
            image: raw.profile_path ? posterUrl(raw.profile_path, 'w92') : null,
            poster_path: raw.profile_path ?? null,
            rating: null,
            href: `/actor/${raw.id}`,
        };
    }

    const date = type === 'movie' ? raw.release_date : raw.first_air_date;
    const year = date ? String(date).slice(0, 4) : '';
    const rating = raw.vote_average && raw.vote_count > 0
        ? Math.round(raw.vote_average * 10) / 10
        : null;

    return {
        id: raw.id,
        media_type: type,
        title,
        subtitle: [year, type === 'movie' ? 'Película' : 'Serie'].filter(Boolean).join(' · '),
        image: raw.poster_path ? posterUrl(raw.poster_path, 'w92') : null,
        poster_path: raw.poster_path ?? null,
        rating,
        // OJO: las series viven en /serie/:id (no /tv/).
        href: type === 'movie' ? `/movie/${raw.id}` : `/serie/${raw.id}`,
    };
}

export const GET: APIRoute = async ({ url }) => {
    const q = (url.searchParams.get('q') || '').trim();

    // Query corta → respuesta vacía (200, el cliente no trata errores).
    if (q.length < 2) return json({ query: q, items: [] }, 200);

    try {
        const data = await tmdbFetch<{ results?: any[] }>('/search/multi', {
            query: q,
            page: '1',
            include_adult: 'false',
        });

        // Recorte por grupo preservando el orden de relevancia de TMDB.
        const counts: Record<string, number> = { movie: 0, tv: 0, person: 0 };
        const items: MultiSearchItem[] = [];
        for (const raw of data.results || []) {
            const item = toItem(raw);
            if (!item || counts[item.media_type] >= MAX_PER_GROUP) continue;
            counts[item.media_type]++;
            items.push(item);
        }

        return json({ query: q, items }, 200, true);
    } catch (err) {
        console.error('[api/search/multi] error:', (err as Error).message);
        return json({ query: q, items: [] }, 200);
    }
};

function json(data: unknown, status: number, cacheable = false): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...(cacheable ? { 'Cache-Control': 'public, max-age=3600' } : {}),
        },
    });
}
