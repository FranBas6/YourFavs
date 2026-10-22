/**
 * POST /api/social/messages/plans/{planId}/rsvp { answer: 'yes' | 'no' } → { ok, plan }
 *
 * «Voy» / «No puedo» (M5). No escribe en el chat. Con «Voy», el título entra en tu Ver pronto si no
 * estaba. Errores: `owner` (400: quien lo propone ya va), `closed` (409), `none` (404).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { rsvpPlan } from '../../../../../../services/BD/social/plans';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const plan = posInt(params.planId);
    const answer = (await request.json().catch(() => null))?.answer;
    if (!plan || (answer !== 'yes' && answer !== 'no')) return badRequest();
    try {
        const r = await rsvpPlan(me, plan, answer);
        if (r.ok) return jsonNoStore(r);
        return jsonNoStore(r, r.error === 'none' ? 404 : r.error === 'closed' ? 409 : 400);
    } catch (err) {
        return serverError('api/social/messages/plans/[planId]/rsvp POST', err);
    }
};
