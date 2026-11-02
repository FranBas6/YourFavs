/**
 * POST /api/import/trakt/disconnect — se acabó la lectura (o se canceló): revoca el token en Trakt y
 * borra la cookie (lote F2). Siempre responde ok: si Trakt falla, la cookie se borra igual.
 */
import type { APIRoute } from 'astro';
import { revokeToken } from '../../../../services/API/shared/traktAccount';
import { json } from '../_shared';
import { clearAccess, getAccess } from './_session';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const token = getAccess(cookies);
    clearAccess(cookies);
    if (token) {
        try { await revokeToken(token); }
        catch (err) { console.error('[api/import/trakt/disconnect] no se pudo revocar:', (err as Error).message); }
    }
    return json({ ok: true, revoked: Boolean(token) });
};
