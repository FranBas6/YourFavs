/**
 * POST /api/social/friends/restore { userId } → deshacer «Eliminar amigo»
 *
 * Vuelve la amistad con su fecha original. Solo quien la eliminó y solo en el minuto siguiente
 * (`social_restore_friend`): no sirve para crear una amistad sin que la otra persona acepte.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, readUserId, serverError, tooMany, unauthorized } from '../../../../lib/social/http';
import { allowSocialWrite, getRelation, restoreFriend } from '../../../../services/BD/social/graph';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const them = await readUserId(request);
    if (!them || them === me) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const done = await restoreFriend(me, them);
        const relation = await getRelation(me, them);
        return done ? jsonNoStore({ ok: true, relation }) : jsonNoStore({ ok: false, error: 'expired', relation }, 409);
    } catch (err) {
        return serverError('api/social/friends/restore', err);
    }
};
