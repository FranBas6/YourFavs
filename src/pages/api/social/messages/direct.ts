/**
 * POST /api/social/messages/direct { handle } | { userId } → { ok, id }
 *
 * Abre el 1:1 con un amigo: el que ya existe o uno nuevo (handoff §2.2 y §8). Si no sois amigos,
 * hay un bloqueo en cualquier sentido o la dirección no existe, la misma respuesta:
 * `403 not_friends` (nada que permita adivinar un bloqueo).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, isUuid, serverError, unauthorized } from '../../../../lib/social/http';
import { normalizeHandle } from '../../../../services/BD/social/handles';
import { idByHandle, openDirect } from '../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const b = await request.json().catch(() => null);
    try {
        const them = isUuid(b?.userId) ? b.userId.toLowerCase()
            : typeof b?.handle === 'string' && b.handle ? await idByHandle(normalizeHandle(b.handle)) : undefined;
        if (them === undefined) return badRequest();
        if (!them) return jsonNoStore({ ok: false, error: 'not_friends' }, 403);
        const r = await openDirect(me, them);
        if (r.ok) return jsonNoStore({ ok: true, id: r.id });
        return jsonNoStore({ ok: false, error: r.error }, r.error === 'rate' ? 429 : 403);
    } catch (err) {
        return serverError('api/social/messages/direct POST', err);
    }
};
