/**
 * POST /api/auth/resend   { email }
 *
 * Vuelve a mandar el email de confirmación de una cuenta creada con email y contraseña. Lo usa
 * el modal en la pantalla «Revisa tu correo» y cuando alguien intenta entrar sin haber confirmado.
 *
 * Responde ok aunque el email no exista o ya esté confirmado (Supabase tampoco manda nada en
 * esos casos): así no sirve para averiguar quién tiene cuenta. Solo se informa del límite de
 * envíos, que es lo único que el usuario puede corregir esperando.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!email) return json({ ok: false, error: 'Falta el email.' }, 400);

    const redirectTo = new URL('/auth/callback', url.origin); // ver register.ts: solo para la plantilla por defecto
    const { error } = await locals.supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectTo.toString() },
    });
    if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) {
        return json({ ok: false, error: mapAuthError(error.code) }, 429);
    }
    if (error) console.error('[api/auth/resend]', error.code, error.message);
    return json({ ok: true });
};
