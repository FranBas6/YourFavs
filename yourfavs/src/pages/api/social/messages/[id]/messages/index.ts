/**
 * POST /api/social/messages/{id}/messages { body, clientId } → { ok, message }
 *
 * Enviar (handoff §2.2 y §4.7). `clientId` (uuid del navegador) hace idempotente el reintento:
 * el mismo `clientId` devuelve el mismo mensaje. Errores: `read_only` (403; nunca dice por qué),
 * `empty` / `too_long` (400), `rate` (429, 30 por minuto), `none` (404: no estás en ella).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { MSG_MAX, sendMessage } from '../../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

const STATUS = { none: 404, read_only: 403, empty: 400, too_long: 400, rate: 429 } as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    if (!conv || typeof b?.body !== 'string' || !isUuid(b?.clientId)) return badRequest();
    // Holgura para espacios de los bordes; el recorte y el tope exacto los hace la función SQL.
    if (b.body.length > MSG_MAX * 2) return jsonNoStore({ ok: false, error: 'too_long' }, 400);
    try {
        const r = await sendMessage(me, conv, b.body, b.clientId.toLowerCase());
        if (r.ok) return jsonNoStore({ ok: true, message: r.message }, 201);
        return jsonNoStore({ ok: false, error: r.error }, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/[id]/messages POST', err);
    }
};
