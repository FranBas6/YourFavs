/**
 * POST /api/auth/reset   { email }
 *
 * Manda el email de «restablecer contraseña». El enlace de nuestra plantilla
 * (`supabase/templates/recovery.html`) lleva `token_hash` y vuelve a `/auth/callback`, que abre la
 * sesión con `verifyOtp` y lleva a `/auth/nueva-contrasena`: funciona en cualquier navegador.
 * `redirectTo` solo lo usa la plantilla por defecto de Supabase (enlace con `?code=`, que sí exige
 * el mismo navegador), por si un día faltara la nuestra en el panel.
 *
 * Responde ok aunque el email no exista (Supabase hace lo mismo): así no sirve para averiguar
 * quién tiene cuenta.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!email) return json({ ok: false, error: 'Escribe tu email arriba y vuelve a pulsar.' }, 400);

    const redirectTo = new URL('/auth/callback', url.origin);
    redirectTo.searchParams.set('next', '/auth/nueva-contrasena');
    const { error } = await locals.supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.toString() });
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 400);
    return json({ ok: true });
};
