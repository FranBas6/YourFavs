/**
 * POST /api/social/messages/{id}/messages { body, clientId, card? } → { ok, message }
 *
 * Enviar (handoff §2.2 y §4.7). `clientId` (uuid del navegador) hace idempotente el reintento:
 * el mismo `clientId` devuelve el mismo mensaje. Errores: `read_only` (403; nunca dice por qué),
 * `empty` / `too_long` (400), `rate` (429, 30 por minuto), `none` (404: no estás en ella).
 *
 * M4: `card: { type: 'title', mediaType, tmdbId }` comparte un título (el texto es el comentario,
 * opcional). Los datos del título los pide el servidor a TMDB; `card` (400) si no existe.
 * M4c: `spoiler: { mediaType, tmdbId, title, season?, episode? }` marca el texto como spoiler.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { MSG_MAX, SEND_STATUS, sendMessage } from '../../../../../../services/BD/social/messages';
import { readSpoiler, readTitleCard } from '../../../../../../services/BD/social/chatCards';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

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
        const spoiler = b.spoiler == null ? null : readSpoiler(b.spoiler);
        if (spoiler === false) return jsonNoStore({ ok: false, error: 'spoiler' }, 400);
        const card = b.card == null ? null : await readTitleCard(b.card);
        if (card === false) return jsonNoStore({ ok: false, error: 'card' }, 400);
        const r = await sendMessage(me, conv, b.body, b.clientId.toLowerCase(), card, spoiler);
        if (r.ok) return jsonNoStore({ ok: true, message: r.message }, 201);
        return jsonNoStore({ ok: false, error: r.error }, SEND_STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/[id]/messages POST', err);
    }
};
