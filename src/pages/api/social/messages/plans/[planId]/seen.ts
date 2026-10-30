/**
 * POST /api/social/messages/plans/{planId}/seen { snooze?: boolean } → { ok, plan }
 *
 * «¿La visteis?» (M5): «Marcar como vista» (la película, como en la ficha) o «Aún no» (`snooze`),
 * que solo deja de preguntar.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { seenPlan } from '../../../../../../services/BD/social/plans';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const plan = posInt(params.planId);
    if (!plan) return badRequest();
    const snooze = Boolean((await request.json().catch(() => null))?.snooze);
    try {
        const r = await seenPlan(me, plan, snooze);
        if (r.ok) return jsonNoStore(r);
        return jsonNoStore(r, 404);
    } catch (err) {
        return serverError('api/social/messages/plans/[planId]/seen POST', err);
    }
};
