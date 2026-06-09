/**
 * /api/lists/items — items dentro de una lista personalizada (Fase L1).
 *
 *  POST /api/lists/items  body { op, ... }:
 *      op=add     { listId, item:{ media_type, tmdb_id, title?, poster_path? } }
 *      op=remove  { listId, itemId }                 // itemId = `${media_type}_${tmdb_id}`
 *      op=reorder { listId, order: itemId[] }
 *
 * Invitado → 401 (gating). El uid sale SIEMPRE de la sesión (locals.user).
 */
import type { APIRoute } from 'astro';
import {
    addItemToList,
    removeItemFromList,
    reorderItems,
} from '../../../services/BD/lists/customLists';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const op = String(body?.op || '');
        const listId = String(body?.listId || '');
        if (!listId) return json({ ok: false, error: 'listId requerido' }, 400);

        if (op === 'add') {
            const item = body?.item;
            const mediaType = item?.media_type;
            if ((mediaType !== 'movie' && mediaType !== 'tv') || !Number.isFinite(Number(item?.tmdb_id))) {
                return json({ ok: false, error: 'item inválido' }, 400);
            }
            await addItemToList(listId, {
                media_type: mediaType,
                tmdb_id: Number(item.tmdb_id),
                title: item.title,
                poster_path: item.poster_path,
            });
            return json({ ok: true });
        }

        if (op === 'remove') {
            const itemId = String(body?.itemId || '');
            if (!itemId) return json({ ok: false, error: 'itemId requerido' }, 400);
            await removeItemFromList(listId, itemId);
            return json({ ok: true });
        }

        if (op === 'reorder') {
            const order = Array.isArray(body?.order) ? body.order.map((x: unknown) => String(x)) : [];
            if (!order.length) return json({ ok: false, error: 'order requerido' }, 400);
            await reorderItems(listId, order);
            return json({ ok: true });
        }

        return json({ ok: false, error: 'Operación no válida' }, 400);
    } catch (err) {
        console.error('[api/lists/items POST] error:', (err as Error).message);
        return json({ ok: false, error: (err as Error).message || 'No se pudo guardar.' }, 400);
    }
};
