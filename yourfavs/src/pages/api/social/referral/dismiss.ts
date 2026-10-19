/**
 * POST /api/social/referral/dismiss → «Ahora no» en la sugerencia «¿Pedirle amistad a Ana?»
 * (handoff social D13). La descarta para siempre.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { serverError, unauthorized } from '../../../../lib/social/http';
import { dismissReferralSuggestion } from '../../../../services/BD/social/referral';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    try {
        await dismissReferralSuggestion(me);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/referral/dismiss', err);
    }
};
