/**
 * GET /api/social/messages → { ok, convs: ConvSummary[] }
 *
 * Lista de conversaciones de quien mira, la más reciente primero (handoff de mensajes §4.1 y §7).
 * El navegador la vuelve a pedir cada 30 s con la lista a la vista (sin tiempo real hasta M3).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../../lib/social/http';
import { listConversations } from '../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    try {
        return jsonNoStore({ ok: true, convs: await listConversations(me) });
    } catch (err) {
        return serverError('api/social/messages GET', err);
    }
};
