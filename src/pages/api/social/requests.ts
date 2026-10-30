/**
 * POST /api/social/requests   { userId }  → pedir amistad
 * DELETE /api/social/requests { userId }  → cancelar la que enviaste
 *
 * Responde `{ ok, relation }`. Errores: `no_profile` (no tienes perfil activo: el modal te lleva a
 * activarlo), `cap` (20 enviadas sin responder) y `unavailable` (perfil apagado o un bloqueo, sin
 * decir cuál). Si te la habían rechazado hace menos de 30 días responde `ok` igual, y el botón dice
 * «Solicitud enviada»: el rechazo es silencioso (handoff social §5.2).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../lib/social/http';
import { allowSocialWrite, cancelRequest, getRelation, sendRequest } from '../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.friends) return badRequest('disabled');
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const result = await sendRequest(me, them);
        if (result === 'no_profile' || result === 'cap') return jsonNoStore({ ok: false, error: result }, 409);
        if (result !== 'ok' && result !== 'friends') return jsonNoStore({ ok: false, error: 'unavailable' }, 409);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/requests POST', err);
    }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        await cancelRequest(me, them);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/requests DELETE', err);
    }
};
