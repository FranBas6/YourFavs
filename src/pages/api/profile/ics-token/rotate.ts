/**
 * POST /api/profile/ics-token/rotate → { ok, url } — «Crear una nueva» dirección del calendario
 * (Mensajes M5c; handoff M5 §3.8). La anterior deja de funcionar al momento.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { icsPath, rotateIcsToken } from '../../../../services/BD/profile/icsToken';

export const prerender = false;

export const POST: APIRoute = async ({ locals, url }) => {
    const me = locals.user?.uid;
    if (!me) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    try {
        const token = await rotateIcsToken(me);
        return jsonNoStore({ ok: true, url: `${url.origin}${icsPath(token)}` });
    } catch (err) {
        console.error('[api/profile/ics-token/rotate] error:', (err as Error).message);
        return jsonNoStore({ ok: false }, 500);
    }
};
