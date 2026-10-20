/**
 * GET /api/social/recommendations/friends?targetType=movie&targetId=550
 *   → { ok, friends: PersonCard[], recent: uid[], alreadySent: uid[] }   (modo «elegir amigo»)
 * GET /api/social/recommendations/friends?to={handle}
 *   → { ok, friend: PersonCard, sentTargets: ['movie:550', …] }           (modo «elegir título»)
 *
 * Para el selector de recomendar (handoff F4 §5.1). Solo amigos y sin bloqueos.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../../lib/social/http';
import { isRecTarget, pickerFriend, pickerFriends } from '../../../../services/BD/social/recommendations';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    try {
        const to = url.searchParams.get('to');
        if (to) {
            const r = await pickerFriend(me, to.slice(0, 40));
            return r ? jsonNoStore({ ok: true, ...r }) : jsonNoStore({ ok: false, error: 'not_friends' }, 404);
        }
        const type = url.searchParams.get('targetType');
        const id = Number(url.searchParams.get('targetId'));
        const target = isRecTarget(type) && Number.isInteger(id) && id > 0 ? { type, id } : null;
        if (type && !target) return badRequest();
        return jsonNoStore({ ok: true, ...(await pickerFriends(me, target)) });
    } catch (err) {
        return serverError('api/social/recommendations/friends', err);
    }
};
