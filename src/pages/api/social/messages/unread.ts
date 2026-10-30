/**
 * GET /api/social/messages/unread → { total }
 *
 * Mensajes sin leer de las conversaciones sin silenciar (contador `.mcnt`, handoff §6). Al cargar
 * cada página el número llega ya con los de la campana (`/api/notifications/counts`); este es el
 * ligero para el sondeo de 30 s en las páginas de mensajes.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { unreadTotal } from '../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me || !SOCIAL_PHASE.messages) return jsonNoStore({ total: 0 });
    try {
        return jsonNoStore({ total: await unreadTotal(me) });
    } catch (err) {
        console.error('[api/social/messages/unread]', (err as Error).message);
        return jsonNoStore({ total: 0 });
    }
};
