/**
 * POST /api/social/messages/groups { name, ids[] } → { ok, id, skipped[] }
 *
 * Grupo nuevo con 2–9 amigos tuyos (handoff §2.2 y §4.9). `skipped`: quien ya estaba en 20 grupos
 * y se ha quedado fuera. Errores: `name` (1–40), `too_few`, `too_many`, `not_friends`, `cap` (tú ya
 * estás en 20) y `rate` (200 conversaciones nuevas al día).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, isUuid, serverError, tooMany, unauthorized } from '../../../../lib/social/http';
import { createGroup } from '../../../../services/BD/social/messages';
import { allowSocialWrite } from '../../../../services/BD/social/graph';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

const STATUS: Record<string, number> = { not_friends: 403, cap: 409, rate: 429 };

export const POST: APIRoute = async ({ request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages || !SOCIAL_PHASE.groups) return badRequest('disabled');
    const b = await request.json().catch(() => null);
    const name = typeof b?.name === 'string' ? b.name.slice(0, 200) : '';
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter(isUuid).map((x: string) => x.toLowerCase()).slice(0, 20) : [];
    if (!allowSocialWrite(me)) return tooMany();
    try {
        const r = await createGroup(me, name, ids);
        if (r.ok) return jsonNoStore({ ok: true, id: r.id, skipped: r.skipped }, 201);
        return jsonNoStore({ ok: false, error: r.error, skipped: r.skipped ?? [] }, STATUS[r.error] ?? 400);
    } catch (err) {
        return serverError('api/social/messages/groups POST', err);
    }
};
