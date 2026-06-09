/**
 * /api/lists — listas personalizadas a nivel de lista (Fase L1).
 *
 *  GET  /api/lists                              → { ok, lists }
 *  GET  /api/lists?media_type=movie&tmdb_id=123 → { ok, lists, memberIds }  (para "Guardar en…")
 *  POST /api/lists  body { op, ... }:
 *      op=create  { name, description?, icon?, colorStamp?, cover? }      → { ok, listId }
 *      op=update  { listId, patch:{ name?, description?, icon?, colorStamp?, cover? } }
 *      op=delete  { listId }
 *      op=reorder { order: listId[] }
 *
 * Invitado → 401 (el cliente abre el modal de registro vía gating). El uid sale
 * SIEMPRE de la sesión (locals.user), nunca del body.
 */
import type { APIRoute } from 'astro';
import {
    getCustomLists,
    getListsMembership,
    createList,
    updateList,
    deleteList,
    reorderLists,
} from '../../../services/BD/lists/customLists';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ url, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const mediaType = url.searchParams.get('media_type');
        const tmdbId = url.searchParams.get('tmdb_id');
        if ((mediaType === 'movie' || mediaType === 'tv') && tmdbId) {
            const { lists, memberIds } = await getListsMembership(mediaType, tmdbId);
            return json({ ok: true, lists, memberIds });
        }
        return json({ ok: true, lists: await getCustomLists() });
    } catch (err) {
        console.error('[api/lists GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudieron leer las listas.' }, 500);
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const op = String(body?.op || '');

        if (op === 'create') {
            const listId = await createList({
                name: body.name,
                description: body.description,
                icon: body.icon,
                colorStamp: body.colorStamp,
                cover: body.cover,
            });
            return json({ ok: true, listId });
        }

        if (op === 'update') {
            const listId = String(body?.listId || '');
            if (!listId) return json({ ok: false, error: 'listId requerido' }, 400);
            const patch = (body?.patch && typeof body.patch === 'object') ? body.patch : {};
            await updateList(listId, patch);
            return json({ ok: true });
        }

        if (op === 'delete') {
            const listId = String(body?.listId || '');
            if (!listId) return json({ ok: false, error: 'listId requerido' }, 400);
            await deleteList(listId);
            return json({ ok: true });
        }

        if (op === 'reorder') {
            const order = Array.isArray(body?.order) ? body.order.map((x: unknown) => String(x)) : [];
            if (!order.length) return json({ ok: false, error: 'order requerido' }, 400);
            await reorderLists(order);
            return json({ ok: true });
        }

        return json({ ok: false, error: 'Operación no válida' }, 400);
    } catch (err) {
        console.error('[api/lists POST] error:', (err as Error).message);
        return json({ ok: false, error: (err as Error).message || 'No se pudo guardar.' }, 400);
    }
};
