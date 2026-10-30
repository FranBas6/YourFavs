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
import { tmdbFetch } from '../../services/API/shared/tmdbClient';
import { toItem } from '../../services/API/shared/summaryItem';

export const prerender = false;

const MAX_IDS = 60;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// `SummaryItem` y `toItem` viven en `services/API/shared/summaryItem.ts` (también los usa el perfil
// público). Se re-exportan aquí para que las rutas que ya los importaban de './summary' no cambien.
export { toItem, type SummaryItem } from '../../services/API/shared/summaryItem';

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
