/**
 * POST /api/lists/fixed — guardar en una lista fija (Favoritos/Pendientes/Vistas)
 * desde el popover "Guardar en…" (Fase L4).
 *
 * Body { media_type, tmdb_id, list, action }. Reusa los handlers de la ficha vía
 * saveFixed. Invitado → 401 (gating). El uid sale de la sesión (locals.user).
 */
import type { APIRoute } from 'astro';
import { saveFixed, isFixedList } from '../../../services/BD/lists/fixedLists';

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
        if (!Number.isFinite(Number(tmdbId))) return json({ ok: false, error: 'tmdb_id inválido' }, 400);
        if (!isFixedList(list)) return json({ ok: false, error: 'list inválida' }, 400);

        const { count } = await saveFixed(mediaType, Number(tmdbId), list, action);
        return json({ ok: true, count });
    } catch (err) {
        console.error('[api/lists/fixed POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
