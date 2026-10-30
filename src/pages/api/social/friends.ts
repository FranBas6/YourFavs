/**
 * DELETE /api/social/friends { userId } → eliminar amigo
 *
 * No toca los follows y no avisa. Se puede deshacer durante un momento con
 * `POST /api/social/friends/restore` (el toast «Deshacer» de 6 s).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../lib/social/http';
import { allowSocialWrite, getRelation, unfriend } from '../../../services/BD/social/graph';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        await unfriend(me, them);
        return jsonNoStore({ ok: true, relation: await getRelation(me, them) });
    } catch (err) {
        return serverError('api/social/friends DELETE', err);
    }
};
