/**
 * GET /api/notifications/counts → { unread, pendingFriends, messages }
 *
 * Los números de la app en una petición (handoff social F2/F3 §6.4): `unread` para la campana
 * y el globo de «Perfil» en móvil; `pendingFriends`, solicitudes de amistad RECIBIDAS sin
 * responder (F3; 0 con la amistad apagada); `messages`, mensajes sin leer de las conversaciones sin
 * silenciar (M1, contador `.mcnt`: no van a la campana). Se pide al cargar la página, sin sondeo.
 *
 * Sin caché en el navegador: los avisos entre personas llegan en cualquier momento (alguien te
 * sigue) y con `max-age` el globo tardaría minutos en enterarse. Contar es barato (índice parcial
 * de no leídas) y el generador diario ya está guardado por día.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../services/http/http';
import { syncNotifications } from '../../../services/notifications/generator';
import { unreadCount } from '../../../services/notifications/notifications';
import { pendingReceivedCount } from '../../../services/social/graph';
import { unreadTotal } from '../../../services/social/messages';
import { SOCIAL_PHASE } from '../../../utils/social/social';

export const prerender = false;

/**
 * QA 7.1 (H83): el generador de avisos va una vez al día por persona, pero esa primera vez llama a TMDB
 * (~40 llamadas). Se le espera como mucho SYNC_WAIT_MS: casi siempre llega y el globo sale al día; si no,
 * se responde con lo que hay y el generador termina después de responder (`waitUntil` de Netlify), así
 * que en la página siguiente ya estará. Sin `waitUntil` (p. ej. en `astro dev`), el proceso sigue vivo
 * igualmente y la promesa termina sola.
 */
const SYNC_WAIT_MS = 1500;

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return jsonNoStore({ unread: 0, pendingFriends: 0, messages: 0 });
    try {
        const sync = syncNotifications(locals.user.platforms ?? []).catch((err) => {
            console.error('[api/notifications/counts] sync:', (err as Error).message);
        });
        const waitUntil = (locals as any).netlify?.context?.waitUntil as ((p: Promise<unknown>) => void) | undefined;
        waitUntil?.(sync);
        await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, SYNC_WAIT_MS))]);
        const [unread, pendingFriends, messages] = await Promise.all([
            unreadCount(),
            SOCIAL_PHASE.friends ? pendingReceivedCount(locals.user.uid) : Promise.resolve(0),
            SOCIAL_PHASE.messages ? unreadTotal(locals.user.uid) : Promise.resolve(0),
        ]);
        return jsonNoStore({ unread, pendingFriends, messages });
    } catch (err) {
        console.error('[api/notifications/counts] error:', (err as Error).message);
        return jsonNoStore({ unread: 0, pendingFriends: 0, messages: 0 });
    }
};
