/**
 * DELETE /api/social/recommendations/{id} → retirar (el Deshacer del toast).
 *
 * `{ ok }` si nadie había hecho nada; `{ ok: false, error: 'answered', withdrawnFor[] }` si
 * alguien ya actuó o respondió (se retira solo para los demás). Solo quien la envió.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../../lib/social/http';
import { withdrawRec } from '../../../../services/BD/social/recommendations';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest();
    try {
        const r = await withdrawRec(me, id);
        if (r.ok) return jsonNoStore({ ok: true });
        return jsonNoStore({ ok: false, error: r.error, withdrawnFor: r.withdrawnFor ?? [] }, r.error === 'none' ? 404 : 409);
    } catch (err) {
        return serverError('api/social/recommendations DELETE', err);
    }
};
