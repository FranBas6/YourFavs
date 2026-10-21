/**
 * GET /api/social/messages/{id}/messages/{mid}/spoiler → { ok, body }
 *
 * «Mostrar igualmente» un spoiler bloqueado (M4c, handoff M4 §3.4): su texto, si ves ese mensaje.
 * No guarda nada: al volver a pintar sigue oculto. Si no se puede, `404` (igual que si no existiera).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../../lib/social/http';
import { spoilerBody } from '../../../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const msg = posInt(params.mid);
    if (!conv || !msg) return badRequest();
    try {
        const body = await spoilerBody(me, conv, msg);
        if (body === null) return jsonNoStore({ ok: false, error: 'none' }, 404);
        return jsonNoStore({ ok: true, body });
    } catch (err) {
        return serverError('api/social/messages/[id]/messages/[mid]/spoiler GET', err);
    }
};
