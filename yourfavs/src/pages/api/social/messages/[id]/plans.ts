/**
 * POST /api/social/messages/{id}/plans
 *   { mediaType, tmdbId, date: 'AAAA-MM-DD', time?: 'HH:MM' | null, note?, source: 'plus' | 'title_card' | 'wtw', wtw?: { of, have } }
 *   → 201 { ok, planId, message }
 *
 * Proponer un plan para verla (M5, handoff M5 §2.2 y §4). Errores: `past_date` (400: ese día u hora
 * ya pasó, en Madrid), `exists` (409: ya hay un plan sin pasar de ese título aquí; trae su fecha),
 * `read_only` (403), `none` (404), `note` / `title` (400), `rate` (429).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../lib/social/http';
import { PLAN_NOTE_MAX, isPlanDate, isPlanTime, proposePlan } from '../../../../../services/BD/social/plans';
import { SOCIAL_PHASE } from '../../../../../utils/constants/social';

export const prerender = false;

const STATUS = { none: 404, read_only: 403, past_date: 400, note: 400, title: 400, rate: 429, exists: 409 } as const;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    const tmdbId = posInt(b?.tmdbId);
    const time = b?.time == null || b.time === '' ? null : b.time;
    const note = typeof b?.note === 'string' ? b.note : null;
    const source = b?.source === 'title_card' || b?.source === 'wtw' ? b.source : 'plus';
    if (!conv || !tmdbId || (b?.mediaType !== 'movie' && b?.mediaType !== 'tv') || !isPlanDate(b?.date) || (time !== null && !isPlanTime(time))) {
        return badRequest();
    }
    if (note && note.length > PLAN_NOTE_MAX * 2) return jsonNoStore({ ok: false, error: 'note' }, 400);
    const wtw = source === 'wtw' && posInt(b?.wtw?.of) && posInt(b?.wtw?.have) ? { of: Number(b.wtw.of), have: Number(b.wtw.have) } : null;
    try {
        const r = await proposePlan(me, conv, { mediaType: b.mediaType, tmdbId, date: b.date, time, note, source, wtw });
        if (r.ok) return jsonNoStore({ ok: true, planId: r.planId, message: r.message }, 201);
        return jsonNoStore(r, STATUS[r.error]);
    } catch (err) {
        return serverError('api/social/messages/[id]/plans POST', err);
    }
};
