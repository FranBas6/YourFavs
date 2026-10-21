/**
 * POST /api/social/messages/{id}/members { ids[] } → { ok, skipped[] }
 *
 * Añadir personas a un grupo (solo admins; amigos tuyos; 10 personas como mucho). Verán los
 * mensajes desde que entren. `skipped`: quien ya está en 20 grupos. Errores: `not_admin` (403),
 * `not_friends` (403), `full` (409), `none` (404).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, tooMany, unauthorized } from '../../../../../../lib/social/http';
import { addMembers } from '../../../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

const STATUS = { none: 404, not_admin: 403, not_friends: 403, full: 409 } as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter(isUuid).map((x: string) => x.toLowerCase()).slice(0, 20) : [];
    if (!conv || !ids.length) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await addMembers(me, conv, ids);
        if (r.ok) return jsonNoStore({ ok: true, skipped: r.skipped });
        return jsonNoStore({ ok: false, error: r.error }, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/[id]/members POST', err);
    }
};
