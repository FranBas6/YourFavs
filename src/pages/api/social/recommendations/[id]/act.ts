/**
 * POST /api/social/recommendations/{id}/act { action: 'add' | 'alerts' | 'open' | 'discard' }
 *   → { ok, rec }   (la recomendación como queda, para repintar el aviso o la tarjeta)
 *
 * `add` la guarda en tus Pendientes; `alerts` activa los avisos de estrenos de esa persona; `open`
 * (productora) solo la marca. Sin aviso para quien la envió. Handoff F4 §4.2.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, serverError, tooMany, unauthorized } from '../../../../../lib/social/http';
import { actRec, receivedOne, type RecAction } from '../../../../../services/BD/social/recommendations';
import { allowSocialWrite } from '../../../../../services/BD/social/graph';

export const prerender = false;

const ACTIONS: RecAction[] = ['add', 'alerts', 'open', 'discard'];

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const id = Number(params.id);
    const action = (await request.json().catch(() => null))?.action;
    if (!Number.isInteger(id) || id <= 0 || !ACTIONS.includes(action)) return badRequest();
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const rec = await actRec(me, id, action);
        if (rec) return jsonNoStore({ ok: true, rec });
        return jsonNoStore({ ok: false, error: 'gone', rec: await receivedOne(me, id) }, 409);
    } catch (err) {
        return serverError('api/social/recommendations/act', err);
    }
};
