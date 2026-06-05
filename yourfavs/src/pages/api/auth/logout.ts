/**
 * POST /api/auth/logout
 *
 * Cierra sesión: borra la cookie y revoca los refresh tokens del usuario en
 * Firebase (así una cookie robada deja de servir, no solo se borra del navegador).
 */
import type { APIRoute } from 'astro';
import { adminAuth } from '../../../utils/firebaseAdmin';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
    const session = cookies.get('session')?.value;

    // Intentamos revocar en servidor; si la cookie ya no es válida, da igual.
    if (session) {
        try {
            const decoded = await adminAuth.verifySessionCookie(session, false);
            await adminAuth.revokeRefreshTokens(decoded.sub);
        } catch {
            /* cookie inválida/caducada: nada que revocar */
        }
    }

    // Borrar ambas cookies pase lo que pase.
    cookies.delete('session', { path: '/' });
    cookies.delete('has_session', { path: '/' });

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
