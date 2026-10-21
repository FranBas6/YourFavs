/**
 * DELETE /api/social/messages/{id}/messages/{mid} → { ok }
 *
 * Borrar uno tuyo: «Mensaje eliminado» para todos al momento (handoff §4.5). Sin confirmación;
 * el Deshacer del navegador (6 s) llama a `restore` con el texto que guardó.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../../lib/social/http';
import { deleteMessage } from '../../../../../../../services/BD/social/messages';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const msg = posInt(params.mid);
    if (!conv || !msg) return badRequest();
    try {
        if (!(await deleteMessage(me, conv, msg))) return jsonNoStore({ ok: false, error: 'none' }, 404);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/messages/[id]/messages/[mid] DELETE', err);
    }
};
