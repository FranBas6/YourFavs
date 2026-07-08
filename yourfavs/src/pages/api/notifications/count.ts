/**
 * GET /api/notifications/count — nº de no leídas para el badge de la campana.
 * Materializa (una vez/día) para que el badge aparezca sin abrir el desplegable.
 * Invitado → { count: 0 }.
 */
import type { APIRoute } from 'astro';
import { syncNotifications } from '../../../services/API/notifications/generator';
import { unreadCount } from '../../../services/BD/notifications/notifications';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
    });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ count: 0 });
    try {
        await syncNotifications(locals.user.platforms ?? []);
        return json({ count: await unreadCount() });
    } catch (err) {
        console.error('[api/notifications/count] error:', (err as Error).message);
        return json({ count: 0 });
    }
};
