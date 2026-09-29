/**
 * POST /api/auth/logout
 *
 * Cierra sesión en TODOS los dispositivos (`scope: 'global'`, que revoca los refresh tokens),
 * igual que hacía la versión de Firebase con `revokeRefreshTokens`: así una cookie robada deja
 * de servir, no solo se borra de este navegador. `signOut` borra además las cookies de Supabase.
 */
import type { APIRoute } from 'astro';
import { clearSessionFlag, json } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies }) => {
    try {
        await locals.supabase.auth.signOut({ scope: 'global' });
    } catch {
        /* sesión ya caducada: nada que revocar */
    }
    clearSessionFlag(cookies);
    return json({ ok: true });
};
