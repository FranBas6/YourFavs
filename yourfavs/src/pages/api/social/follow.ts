/**
 * POST /api/social/follow   { userId }  → seguir
 * DELETE /api/social/follow { userId }  → dejar de seguir
 *
 * Responde `{ ok, relation }` con la relación nueva, para que el botón se repinte sin otra
 * petición. Si no se puede seguir (perfil apagado o un bloqueo en cualquier sentido) responde
 * `unavailable`, sin decir cuál de las dos: un bloqueo nunca se delata (handoff §5.2).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../lib/social/http';
import { allowSocialWrite, follow, getRelation, unfollow } from '../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.follow) return badRequest('disabled');
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const result = await follow(me, them);
        if (result !== 'ok') return jsonNoStore({ ok: false, error: 'unavailable' }, 409);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/follow POST', err);
    }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        await unfollow(me, them);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/follow DELETE', err);
    }
};
