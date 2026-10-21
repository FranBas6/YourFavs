/**
 * GET   /api/social/messages/{id}[?before=|?after=&from=] → { ok, chat: ChatView }
 * PATCH /api/social/messages/{id} { name?, muted? } → { ok }
 *
 * GET: sin parámetros, los 50 últimos; `before`, 50 más hacia atrás; `after` (el sondeo de 5 s con
 * el chat abierto), lo nuevo y los borrados desde `from`. `404 left` si saliste o te quitaron de
 * un grupo («Ya no estás en este grupo»); `404 none` si no es tuya o no existe.
 *
 * PATCH: `muted` es solo para ti; `name` (renombrar) solo para admins de un grupo.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, posInt, serverError, tooMany, unauthorized } from '../../../../../lib/social/http';
import { getHistory, renameGroup, setMuted } from '../../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    if (!conv) return badRequest();
    const q = url.searchParams;
    try {
        const r = await getHistory(me, conv, {
            before: posInt(q.get('before')) ?? undefined,
            after: posInt(q.get('after')) ?? undefined,
            from: posInt(q.get('from')) ?? undefined,
        });
        if (!r.ok) return jsonNoStore({ ok: false, error: r.error }, 404);
        return jsonNoStore({ ok: true, chat: r.chat });
    } catch (err) {
        return serverError('api/social/messages/[id] GET', err);
    }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    if (!conv || !b || (typeof b.muted !== 'boolean' && typeof b.name !== 'string')) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        if (typeof b.name === 'string') {
            if (!SOCIAL_PHASE.groups) return badRequest('disabled');
            const r = await renameGroup(me, conv, b.name.slice(0, 200));
            if (r !== 'ok') return jsonNoStore({ ok: false, error: r }, r === 'none' ? 404 : r === 'not_admin' ? 403 : 400);
        }
        if (typeof b.muted === 'boolean' && !(await setMuted(me, conv, b.muted))) {
            return jsonNoStore({ ok: false, error: 'none' }, 404);
        }
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/social/messages/[id] PATCH', err);
    }
};
