/**
 * POST /api/social/messages/{id}/members/{uid}/admin → { ok }
 *
 * Dar permisos de administración a otra persona del grupo (solo admins). Puede haber varias.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, tooMany, unauthorized } from '../../../../../../../lib/social/http';
import { makeAdmin } from '../../../../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    const conv = posInt(params.id);
    if (!conv || !isUuid(params.uid)) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await makeAdmin(me, conv, params.uid.toLowerCase());
        if (r === 'ok') return jsonNoStore({ ok: true });
        return jsonNoStore({ ok: false, error: r }, r === 'not_admin' ? 403 : 404);
    } catch (err) {
        return serverError('api/social/messages/[id]/members/[uid]/admin POST', err);
    }
};
