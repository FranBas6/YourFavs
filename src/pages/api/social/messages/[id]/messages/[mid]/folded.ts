/**
 * GET /api/social/messages/{id}/messages/{mid}/folded → { ok, body }
 *
 * «Mostrar» un mensaje plegado: solo en grupos y solo para quien bloqueó a su autor (handoff §4.4).
 * A cualquier otra persona, `404` (igual que si no existiera).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../../lib/social/http';
import { foldedBody } from '../../../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    const conv = posInt(params.id);
    const msg = posInt(params.mid);
    if (!conv || !msg) return badRequest();
    try {
        const body = await foldedBody(me, conv, msg);
        if (body === null) return jsonNoStore({ ok: false, error: 'none' }, 404);
        return jsonNoStore({ ok: true, body });
    } catch (err) {
        return serverError('api/social/messages/[id]/messages/[mid]/folded GET', err);
    }
};
