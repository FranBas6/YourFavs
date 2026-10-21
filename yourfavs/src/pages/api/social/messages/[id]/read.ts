/**
 * POST /api/social/messages/{id}/read { lastId } → { ok }
 *
 * Leído hasta `lastId` (nunca hacia atrás). Sirve para «Visto» (1:1), «Nuevos» y el contador.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../lib/social/http';
import { markRead } from '../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    const lastId = posInt(b?.lastId);
    if (!conv || !lastId) return badRequest();
    try {
        await markRead(me, conv, lastId);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/messages/[id]/read POST', err);
    }
};
