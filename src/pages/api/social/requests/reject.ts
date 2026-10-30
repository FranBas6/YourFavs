/**
 * POST /api/social/requests/reject { userId }
 *
 * Rechazar la solicitud que te envió `userId`. NO avisa a nadie: para quien la envió sigue «enviada».
 * Responde `{ ok, relation }`; si ya no estaba pendiente (la cancelaron), `gone`.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../../lib/social/http';
import { allowSocialWrite, getRelation, respondRequest } from '../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.friends) return badRequest('disabled');
    const from = await readUserId(request);
    if (!from || from === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const done = await respondRequest(me, from, false);
        const relation = await getRelation(me, from);
        return done ? jsonNoStore({ ok: true, relation }) : jsonNoStore({ ok: false, error: 'gone', relation }, 409);
    } catch (err) {
        return serverError('api/social/requests/reject', err);
    }
};
