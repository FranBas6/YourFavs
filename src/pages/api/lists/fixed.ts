/**
 * POST /api/lists/fixed — guardar en una lista fija (Favoritos/Pendientes/Vistas)
 * desde el popover "Guardar en…" (Fase L4).
 *
 * Body { media_type, tmdb_id, list, action }, o `tmdb_ids: number[]` (≤ 30) para varios a la vez
 * (página de saga: «Añadir las que me faltan a Pendientes» y su «Deshacer»). Reusa los handlers de la ficha vía
 * saveFixed. Invitado → 401 (gating). El uid sale de la sesión (locals.user).
 */
import type { APIRoute } from 'astro';
import { saveFixed, saveFixedMany, isFixedList } from '../../../services/library/fixedLists';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const mediaType = body?.media_type;
        const tmdbId = body?.tmdb_id;
        const list = body?.list;
        const action = body?.action === 'remove' ? 'remove' : 'add';

        if (mediaType !== 'movie' && mediaType !== 'tv') return json({ ok: false, error: 'media_type inválido' }, 400);
        if (!isFixedList(list)) return json({ ok: false, error: 'list inválida' }, 400);

        // Varios a la vez (página de saga): `tmdb_ids` en vez de `tmdb_id`. Tope de 30 (una saga
        // larga tiene ~25 películas) para que la petición no pase del límite de tiempo de Netlify.
        if (Array.isArray(body?.tmdb_ids)) {
            const ids = [...new Set((body.tmdb_ids as unknown[]).map(Number))];
            if (ids.length === 0 || ids.length > 30 || !ids.every((n) => Number.isInteger(n) && n > 0)) {
                return json({ ok: false, error: 'tmdb_ids inválidos' }, 400);
            }
            const { count } = await saveFixedMany(mediaType, ids, list, action);
            return json({ ok: true, count });
        }

        if (!Number.isFinite(Number(tmdbId))) return json({ ok: false, error: 'tmdb_id inválido' }, 400);
        const { count } = await saveFixed(mediaType, Number(tmdbId), list, action);
        return json({ ok: true, count });
    } catch (err) {
        console.error('[api/lists/fixed POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
