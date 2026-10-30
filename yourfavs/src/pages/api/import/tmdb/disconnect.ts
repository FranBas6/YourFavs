/**
 * POST /api/import/tmdb/disconnect — se acabó la lectura (o se canceló): revoca el token de acceso
 * en TMDB y borra la cookie (TMDB D3c). Siempre responde ok: si TMDB falla, la cookie se borra igual.
 */
import type { APIRoute } from 'astro';
import { revokeAccessToken } from '../../../../services/API/shared/tmdbAccount';
import { json } from '../_shared';
import { clearAccess, getAccess } from './_session';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const session = getAccess(cookies);
    clearAccess(cookies);
    if (session) {
        try { await revokeAccessToken(session.accessToken); }
        catch (err) { console.error('[api/import/tmdb/disconnect] no se pudo revocar:', (err as Error).message); }
    }
    return json({ ok: true, revoked: Boolean(session) });
};
