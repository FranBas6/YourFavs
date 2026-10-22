/**
 * PATCH  /api/social/messages/plans/{planId} { date?, time?: 'HH:MM' | null, note?: string | null } → { ok, plan }
 * DELETE /api/social/messages/plans/{planId} → { ok, plan }
 *
 * Cambiar o cancelar un plan (M5, handoff M5 §2.2): solo quien lo propone (`403 not_owner`), y ni
 * cancelado ni pasado (`409 closed`). Cambiar el día o la hora deja una línea en el chat y avisa a
 * quien dijo «Voy»; sus respuestas se mantienen. `past_date` (400), `same` (400: nada que cambiar).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { PLAN_NOTE_MAX, cancelPlan, changePlan, isPlanDate, isPlanTime, type PlanError } from '../../../../../../services/BD/social/plans';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

const STATUS: Record<PlanError, number> = { none: 404, owner: 400, closed: 409, not_owner: 403, past_date: 400, note: 400, same: 400 };

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const plan = posInt(params.planId);
    const b = await request.json().catch(() => null);
    if (!plan || !b) return badRequest();
    const c: { date?: string; time?: string | null; note?: string | null } = {};
    if (b.date !== undefined) { if (!isPlanDate(b.date)) return badRequest(); c.date = b.date; }
    if (b.time !== undefined) { if (b.time !== null && b.time !== '' && !isPlanTime(b.time)) return badRequest(); c.time = b.time || null; }
    if (b.note !== undefined) {
        if (b.note !== null && typeof b.note !== 'string') return badRequest();
        if (typeof b.note === 'string' && b.note.length > PLAN_NOTE_MAX * 2) return jsonNoStore({ ok: false, error: 'note' }, 400);
        c.note = b.note;
    }
    try {
        const r = await changePlan(me, plan, c);
        if (r.ok) return jsonNoStore(r);
        return jsonNoStore(r, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/plans/[planId] PATCH', err);
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const plan = posInt(params.planId);
    if (!plan) return badRequest();
    try {
        const r = await cancelPlan(me, plan);
        if (r.ok) return jsonNoStore(r);
        return jsonNoStore(r, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/plans/[planId] DELETE', err);
    }
};
