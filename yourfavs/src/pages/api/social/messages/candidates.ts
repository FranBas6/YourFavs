/**
 * GET /api/social/messages/candidates[?conv=] → { ok, people: { person, inGroup, full }[] }
 *
 * Tus amigos para el selector de grupo (handoff §4.9): «nuevo» sin `conv`; «añadir» con `conv`,
 * marcando quién está ya dentro. `full`: está en 20 grupos («Está en demasiados grupos»).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../lib/social/http';
import { groupCandidates } from '../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    try {
        return jsonNoStore({ ok: true, people: await groupCandidates(me, posInt(url.searchParams.get('conv'))) });
    } catch (err) {
        return serverError('api/social/messages/candidates GET', err);
    }
};
