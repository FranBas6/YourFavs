/**
 * POST /api/social/block   { userId }  → bloquear
 * DELETE /api/social/block { userId }  → desbloquear
 *
 * Bloquear corta todo en una transacción: dejáis de seguiros en los dos sentidos y se borran los
 * avisos que os hubierais provocado. Nadie recibe aviso. Desbloquear no devuelve nada de eso.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../lib/social/http';
import { allowSocialWrite, block, getRelation, unblock, userExists } from '../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.block) return badRequest('disabled');
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        if (!(await userExists(them))) return badRequest();
        await block(me, them);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/block POST', err);
    }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        await unblock(me, them);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/block DELETE', err);
    }
};
