/**
 * GET /api/social/messages/targets → { ok, convs: ConvSummary[], friends: PersonCard[] }
 *
 * Para el selector «Enviar a…» (M4, handoff M4 §3.5): tus conversaciones en las que puedes escribir
 * y tus amigos sin conversación todavía («Empezaréis una conversación»).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../../lib/social/http';
import { sendTargets } from '../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    try {
        return jsonNoStore({ ok: true, ...(await sendTargets(me)) });
    } catch (err) {
        return serverError('api/social/messages/targets GET', err);
    }
};
