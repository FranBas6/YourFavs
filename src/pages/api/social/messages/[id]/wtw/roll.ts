/**
 * POST /api/social/messages/{id}/wtw/roll { who: uuid[], maxRuntime?, exclude?: string[] }
 *   → { ok, empty: true, of } | { ok, empty: false, roll, tier: 'all' | 'minus', restart }
 *
 * Una tirada de «¿Qué vemos?» (M4d, handoff M4 §3.6). PRIVADA: no se guarda ni le llega a nadie.
 * `exclude`: lo ya tirado en esta sesión («movie:123»), para que «Otra» no repita.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../../lib/http';
import { badRequest, isUuid, posInt, serverError, unauthorized } from '../../../../../../lib/social/http';
import { wtwRoll } from '../../../../../../services/BD/social/wtw';
import { SOCIAL_PHASE } from '../../../../../../utils/constants/social';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const conv = posInt(params.id);
    const b = await request.json().catch(() => null);
    const who = Array.isArray(b?.who) ? b.who.filter(isUuid).map((x: string) => x.toLowerCase()).slice(0, 10) : null;
    if (!conv || !who) return badRequest();
    const maxRuntime = posInt(b?.maxRuntime);
    const exclude = Array.isArray(b?.exclude) ? b.exclude.filter((x: unknown) => typeof x === 'string' && /^(movie|tv):\d{1,9}$/.test(x)).slice(0, 200) : [];
    try {
        const r = await wtwRoll(me, conv, who, { maxRuntime, exclude });
        if (!r) return jsonNoStore({ ok: false, error: 'none' }, 404);
        return jsonNoStore({ ok: true, ...r });
    } catch (err) {
        return serverError('api/social/messages/[id]/wtw/roll POST', err);
    }
};
