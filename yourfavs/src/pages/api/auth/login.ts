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
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 401);

    setSessionFlag(cookies);
    return json({ ok: true });
};
