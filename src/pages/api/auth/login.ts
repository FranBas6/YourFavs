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
    // `code` para dos casos que el modal trata aparte: `email_not_confirmed` (pasa a «Confirma tu email»
    // con reenviar) e `invalid_credentials` (conserva el email, vacía la contraseña y le da el foco; 7.4).
    // `user_not_found` sale como `invalid_credentials`: no se dice si el email existe.
    if (error) {
        const code = error.code === 'email_not_confirmed' ? error.code
            : (error.code === 'invalid_credentials' || error.code === 'user_not_found') ? 'invalid_credentials'
            : undefined;
        return json({ ok: false, error: mapAuthError(error.code), code }, 401);
    }

    setSessionFlag(cookies);
    return json({ ok: true });
};
