/**
 * POST /api/auth/new-password   { password }
 *
 * Pone la contraseña nueva tras entrar con el enlace del email (la sesión la abrió
 * `/auth/callback`). También vale para quien entra con Google y quiere añadir contraseña.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: mapAuthError('session_not_found') }, 401);
    const body = await request.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < 6) return json({ ok: false, error: mapAuthError('weak_password') }, 400);

    const { error } = await locals.supabase.auth.updateUser({ password });
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 400);
    return json({ ok: true });
};
