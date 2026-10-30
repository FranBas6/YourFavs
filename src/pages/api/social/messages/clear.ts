/**
 * POST /api/social/messages/clear → { ok }
 *
 * «Limpiar» el desplegable de Mensajes de la cabecera (M3b): las conversaciones salen de él y el
 * contador baja a 0 hasta que llegue algo nuevo. No es leer: nadie recibe un «Visto». La página de
 * Mensajes sigue enseñándolas todas.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, serverError, tooMany, unauthorized } from '../../../../lib/social/http';
import { clearInbox } from '../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    if (!allowSocialWrite(me)) return tooMany();
    try {
        await clearInbox(me);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/messages/clear POST', err);
    }
};
