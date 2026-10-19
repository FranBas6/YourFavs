/**
 * /api/notifications — buzón de la campana (Bloque 4).
 *
 *  GET  → materializa (una vez/día) desde las señales y devuelve { ok, items, unread }. Los avisos
 *         entre personas (`follow`…) llegan con la persona y la relación ACTUAL para pintar sus
 *         botones o su estado final (`withSocialState`).
 *  POST → { op: 'read', id }  marca una leída · { op: 'read_all' } marca todas.
 *
 * Invitado → 401. El uid sale de la sesión.
 */
import type { APIRoute } from 'astro';
import { syncNotifications } from '../../../services/API/notifications/generator';
import { listNotifications, unreadCount, markRead, markAllRead } from '../../../services/BD/notifications/notifications';
import { withSocialState } from '../../../services/BD/social/notifState';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        await syncNotifications(locals.user.platforms ?? []);
        const [docs, unread] = await Promise.all([listNotifications(30), unreadCount()]);
        const items = await withSocialState(locals.user.uid, docs);
        return json({ ok: true, items, unread });
    } catch (err) {
        console.error('[api/notifications GET] error:', (err as Error).message);
        return json({ ok: false, items: [], unread: 0 }, 500);
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const op = String(body?.op || '');
        if (op === 'read') {
            const id = String(body?.id || '');
            if (!id) return json({ ok: false, error: 'id requerido' }, 400);
            await markRead(id);
            return json({ ok: true });
        }
        if (op === 'read_all') {
            await markAllRead();
            return json({ ok: true });
        }
        return json({ ok: false, error: 'Operación no válida' }, 400);
    } catch (err) {
        console.error('[api/notifications POST] error:', (err as Error).message);
        return json({ ok: false }, 500);
    }
};
