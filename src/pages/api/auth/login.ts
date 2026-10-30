/**
 * POST /api/auth/login   { email, password }
 *
 * Entra con email y contraseña. Supabase deja la sesión en cookies `httpOnly` (ver
 * `lib/supabase/server.ts`); a partir de ahí el middleware reconoce al usuario en cada request.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError, setSessionFlag } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return json({ ok: false, error: 'Rellena email y contraseña.' }, 400);

    const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
    // `code` solo para `email_not_confirmed`: el modal lo usa para pasar a «Revisa tu correo» con
    // el botón de reenviar. El resto de errores se quedan en el mensaje (no hace falta más).
    if (error) {
        const code = error.code === 'email_not_confirmed' ? error.code : undefined;
        return json({ ok: false, error: mapAuthError(error.code), code }, 401);
    }

    setSessionFlag(cookies);
    return json({ ok: true });
};
