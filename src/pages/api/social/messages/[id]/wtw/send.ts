/**
 * POST /api/social/messages/{id}/wtw/send { who: uuid[], mediaType, tmdbId } → { ok, message }
 *
 * Publica una tirada de «¿Qué vemos?» como tarjeta (M4d, handoff M4 §3.6). El servidor vuelve a
 * comprobar que ese título está en el bote de esas personas: `409 gone` si ya no (alguien lo quitó
 * de Pendientes mientras tanto). Los demás errores, como al enviar un mensaje.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { wtwSend } from '../../../../../../services/BD/social/wtw';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

const STATUS = { gone: 409, none: 404, read_only: 403, rate: 429 } as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    const who = Array.isArray(b?.who) ? b.who.filter(isUuid).map((x: string) => x.toLowerCase()).slice(0, 10) : null;
    const tmdbId = posInt(b?.tmdbId);
    if (!conv || !who || !tmdbId || (b?.mediaType !== 'movie' && b?.mediaType !== 'tv')) return badRequest();
    try {
        const r = await wtwSend(me, conv, who, { mediaType: b.mediaType, tmdbId });
        if (r.ok) return jsonNoStore({ ok: true, message: r.message }, 201);
        return jsonNoStore({ ok: false, error: r.error }, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/[id]/wtw/send POST', err);
    }
};
