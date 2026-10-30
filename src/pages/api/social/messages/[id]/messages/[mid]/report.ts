/**
 * POST /api/social/messages/{id}/messages/{mid}/report { reason, note? } → { ok }
 *
 * Reportar un mensaje ajeno que ves (handoff §4.6). `reason`: spam | harassment | other; nota de
 * 200 como mucho. Una vez por persona y mensaje (`409 already`). Lo revisa el equipo en
 * `/admin/reportes`; quien escribió el mensaje no sabe quién lo reportó.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../../lib/http';
import { badRequest, posInt, serverError, tooMany, unauthorized } from '../../../../../../../lib/social/http';
import { isReportReason, reportMessage } from '../../../../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const msg = posInt(params.mid);
    const b = await request.json().catch(() => null);
    if (!conv || !msg || !isReportReason(b?.reason)) return badRequest();
    const note = typeof b?.note === 'string' ? b.note.trim().slice(0, 200) : '';
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await reportMessage(me, conv, msg, b.reason, note);
        if (r === 'ok') return jsonNoStore({ ok: true });
        return jsonNoStore({ ok: false, error: r }, r === 'already' ? 409 : 404);
    } catch (err) {
        return serverError('api/social/messages/[id]/messages/[mid]/report POST', err);
    }
};
