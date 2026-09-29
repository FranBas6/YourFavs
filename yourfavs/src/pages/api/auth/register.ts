/**
 * POST /api/auth/register   { email, password }
 *
 * Crea la cuenta y entra en el mismo paso: la confirmación por email está apagada, como lo
 * estaba en Firebase. El perfil (`profiles`) lo crea el trigger `on_auth_user_created`.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError, setSessionFlag } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return json({ ok: false, error: 'Rellena email y contraseña.' }, 400);
    if (password.length < 6) return json({ ok: false, error: mapAuthError('weak_password') }, 400);

    const { data, error } = await locals.supabase.auth.signUp({ email, password });
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 400);
    // Sin sesión = el proyecto pide confirmar el email. No debería pasar (está apagado en
    // config.toml y en el panel), pero si alguien lo enciende, que el mensaje lo diga.
    if (!data.session) return json({ ok: false, error: 'Revisa tu email para confirmar la cuenta.' }, 202);

    setSessionFlag(cookies);
    return json({ ok: true, isNewUser: true });
};
