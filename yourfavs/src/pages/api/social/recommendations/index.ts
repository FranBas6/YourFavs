/**
 * POST /api/social/recommendations { targetType, targetId, title, image, toIds[], message? }
 *   → { ok, recId, skipped[] }   (skipped: ya la tenían pendiente de ti y sin responder)
 *
 * Errores: `not_friends` (alguno no es tu amigo o hay un bloqueo), `too_many` (de 1 a 10),
 * `rate` (30 envíos al día), `all_skipped` (todos la tenían ya). Handoff F4 §4.2.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, isUuid, serverError, tooMany, unauthorized } from '../../../../lib/social/http';
import { isRecTarget, sendRec } from '../../../../services/BD/social/recommendations';
import { allowSocialWrite } from '../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

/** Texto plano de una línea (sin saltos), recortado. */
const oneLine = (v: unknown, max: number) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.recommend) return badRequest('disabled');
    const b = await request.json().catch(() => null);
    const type = b?.targetType;
    const id = Number(b?.targetId);
    const title = oneLine(b?.title, 300);
    const toIds: string[] = Array.isArray(b?.toIds) ? b.toIds.filter(isUuid).map((x: string) => x.toLowerCase()) : [];
    // La imagen es una ruta de TMDB («/abc.jpg»), nunca una URL entera.
    const image = typeof b?.image === 'string' && /^\/[\w.-]+$/.test(b.image) ? b.image : null;
    if (!isRecTarget(type) || !Number.isInteger(id) || id <= 0 || !title) return badRequest();
    if (!toIds.length || toIds.length > 10) return jsonNoStore({ ok: false, error: 'too_many' }, 400);
    const message = oneLine(b?.message, 140) || null;
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await sendRec(me, { type, id, title, image, to: toIds, message });
        if (r.ok) return jsonNoStore({ ok: true, recId: r.recId, skipped: r.skipped });
        const status = r.error === 'not_friends' ? 403 : r.error === 'rate' ? 429 : 409;
        return jsonNoStore({ ok: false, error: r.error, skipped: r.skipped }, status);
    } catch (err) {
        return serverError('api/social/recommendations POST', err);
    }
};
