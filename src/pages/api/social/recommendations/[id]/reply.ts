/**
 * POST /api/social/recommendations/{id}/reply { key } | { text }
 *   → { ok, rec }; `409` si ya habías respondido (una sola respuesta: no es un chat).
 *
 * Respuesta rápida (`thanks`, `seen_it`, `saving`, `not_for_me`) o una frase de una línea (≤140).
 * Solo después de actuar, o si la tenías o la viste. Quien la envió recibe un aviso SIN el texto.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, serverError, tooMany, unauthorized } from '../../../../../lib/social/http';
import { isQuickKey, replyRec } from '../../../../../services/BD/social/recommendations';
import { allowSocialWrite } from '../../../../../services/BD/social/graph';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const id = Number(params.id);
    const b = await request.json().catch(() => null);
    const text = typeof b?.text === 'string' ? b.text.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
    if (!Number.isInteger(id) || id <= 0 || (!text && !isQuickKey(b?.key))) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const { result, rec } = await replyRec(me, id, text ? { text } : { key: b.key });
        if (result === 'ok') return jsonNoStore({ ok: true, rec });
        const status = result === 'already' ? 409 : result === 'pending' ? 409 : 404;
        return jsonNoStore({ ok: false, error: result, rec }, status);
    } catch (err) {
        return serverError('api/social/recommendations/reply', err);
    }
};
