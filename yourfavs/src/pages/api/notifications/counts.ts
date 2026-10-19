/**
 * GET /api/notifications/counts → { unread, pendingFriends }
 *
 * Los dos números de la app en una petición (handoff social F2/F3 §6.4): `unread` para la campana
 * y el globo de «Perfil» en móvil; `pendingFriends`, solicitudes de amistad RECIBIDAS sin
 * responder (0 hasta la F3). Se pide al cargar la página, sin sondeo.
 *
 * Sin caché en el navegador: los avisos entre personas llegan en cualquier momento (alguien te
 * sigue) y con `max-age` el globo tardaría minutos en enterarse. Contar es barato (índice parcial
 * de no leídas) y el generador diario ya está guardado por día.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { syncNotifications } from '../../../services/API/notifications/generator';
import { unreadCount } from '../../../services/BD/notifications/notifications';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return jsonNoStore({ unread: 0, pendingFriends: 0 });
    try {
        await syncNotifications(locals.user.platforms ?? []);
        return jsonNoStore({ unread: await unreadCount(), pendingFriends: 0 });
    } catch (err) {
        console.error('[api/notifications/counts] error:', (err as Error).message);
        return jsonNoStore({ unread: 0, pendingFriends: 0 });
    }
};
