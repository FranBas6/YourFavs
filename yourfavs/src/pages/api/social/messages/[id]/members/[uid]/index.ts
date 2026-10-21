/**
 * DELETE /api/social/messages/{id}/members/{uid} → { ok }
 *
 * Quitar a alguien de un grupo (solo admins). Si `uid` eres tú, es salir: si eras la única
 * persona admin, el cargo pasa a quien lleva más tiempo; si no queda nadie, el grupo se borra.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, tooMany, unauthorized } from '../../../../../../../lib/social/http';
import { removeMember } from '../../../../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    const conv = posInt(params.id);
    if (!conv || !isUuid(params.uid)) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await removeMember(me, conv, params.uid.toLowerCase());
        if (r === 'ok') return jsonNoStore({ ok: true });
        return jsonNoStore({ ok: false, error: r }, r === 'not_admin' ? 403 : 404);
    } catch (err) {
        return serverError('api/social/messages/[id]/members/[uid] DELETE', err);
    }
};
