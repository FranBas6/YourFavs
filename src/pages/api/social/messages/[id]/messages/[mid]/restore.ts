/**
 * POST /api/social/messages/{id}/messages/{mid}/restore { body } → { ok }
 *
 * Deshacer un borrado: 10 s como mucho y solo con el MISMO texto (si no, `410 expired`), para que
 * no sirva para editar.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../../lib/social/http';
import { MSG_MAX, restoreMessage } from '../../../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const msg = posInt(params.mid);
    const b = await request.json().catch(() => null);
    if (!conv || !msg || typeof b?.body !== 'string' || b.body.length > MSG_MAX) return badRequest();
    try {
        if (!(await restoreMessage(me, conv, msg, b.body))) return jsonNoStore({ ok: false, error: 'expired' }, 410);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/messages/[id]/messages/[mid]/restore POST', err);
    }
};
