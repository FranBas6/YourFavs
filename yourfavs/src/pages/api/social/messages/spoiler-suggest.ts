/**
 * GET /api/social/messages/spoiler-suggest?conv= → { ok, inChat: PickTitle[], watching: PickTitle[] }
 *
 * Sugerencias del selector «Marcar como spoiler» antes de escribir (M4c, handoff M4 §3.3): lo que
 * ha salido en esta conversación y lo que estás viendo. `404` si no estás en ella.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../lib/social/http';
import { spoilerSuggest } from '../../../../services/BD/social/chatCards';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(url.searchParams.get('conv'));
    if (!conv) return badRequest();
    try {
        const r = await spoilerSuggest(me, conv);
        if (!r) return jsonNoStore({ ok: false, error: 'none' }, 404);
        return jsonNoStore({ ok: true, ...r });
    } catch (err) {
        return serverError('api/social/messages/spoiler-suggest GET', err);
    }
};
