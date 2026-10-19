/**
 * GET /api/notifications/counts → { unread, pendingFriends }
 *
 * Los dos números de la app en una petición (handoff social F2/F3 §6.4): `unread` para la campana
 * y el globo de «Perfil» en móvil; `pendingFriends`, solicitudes de amistad RECIBIDAS sin
 * responder (F3; 0 con la amistad apagada). Se pide al cargar la página, sin sondeo.
 *
 * Sin caché en el navegador: los avisos entre personas llegan en cualquier momento (alguien te
 * sigue) y con `max-age` el globo tardaría minutos en enterarse. Contar es barato (índice parcial
 * de no leídas) y el generador diario ya está guardado por día.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { syncNotifications } from '../../../services/API/notifications/generator';
import { unreadCount } from '../../../services/BD/notifications/notifications';
import { pendingReceivedCount } from '../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return jsonNoStore({ unread: 0, pendingFriends: 0 });
    try {
        await syncNotifications(locals.user.platforms ?? []);
        const [unread, pendingFriends] = await Promise.all([
            unreadCount(),
            SOCIAL_PHASE.friends ? pendingReceivedCount(locals.user.uid) : Promise.resolve(0),
        ]);
        return jsonNoStore({ unread, pendingFriends });
    } catch (err) {
        console.error('[api/notifications/counts] error:', (err as Error).message);
        return jsonNoStore({ unread: 0, pendingFriends: 0 });
    }
};
