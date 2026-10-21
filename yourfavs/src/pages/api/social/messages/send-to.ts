/**
 * POST /api/social/messages/send-to { convId | handle, card, body?, clientId } → { ok, convId, message }
 *
 * «Enviar a…» desde una ficha (M4, handoff M4 §3.5 y §7): una tarjeta de título a una conversación
 * tuya o, con `handle`, al 1:1 con ese amigo (se abre si no existe). Si no sois amigos, hay un
 * bloqueo o la dirección no existe: `403 not_friends`, siempre igual. El resto de errores, como al
 * enviar desde el chat.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, unauthorized } from '../../../../lib/social/http';
import { normalizeHandle } from '../../../../services/BD/social/handles';
import { MSG_MAX, SEND_STATUS, idByHandle, openDirect, sendMessage } from '../../../../services/BD/social/messages';
import { readTitleCard } from '../../../../services/BD/social/chatCards';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const b = await request.json().catch(() => null);
    const body = typeof b?.body === 'string' ? b.body : '';
    let conv = posInt(b?.convId);
    const handle = typeof b?.handle === 'string' && b.handle ? normalizeHandle(b.handle) : null;
    if ((!conv && !handle) || !isUuid(b?.clientId) || b?.card == null) return badRequest();
    if (body.length > MSG_MAX * 2) return jsonNoStore({ ok: false, error: 'too_long' }, 400);
    try {
        const card = await readTitleCard(b.card);
        if (card === false) return jsonNoStore({ ok: false, error: 'card' }, 400);
        if (!conv) {
            const them = await idByHandle(handle!);
            if (!them) return jsonNoStore({ ok: false, error: 'not_friends' }, 403);
            const o = await openDirect(me, them);
            if (!o.ok) return jsonNoStore({ ok: false, error: o.error }, o.error === 'rate' ? 429 : 403);
            conv = o.id;
        }
        const r = await sendMessage(me, conv, body, b.clientId.toLowerCase(), card);
        if (r.ok) return jsonNoStore({ ok: true, convId: conv, message: r.message }, 201);
        return jsonNoStore({ ok: false, error: r.error }, SEND_STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/send-to POST', err);
    }
};
