/**
 * POST /api/auth/register   { email, password, next? }
 *
 * Crea la cuenta. Desde la F0 de la capa social (docs/PLAN_SOCIAL.md) el proyecto PIDE CONFIRMAR
 * EL EMAIL: con un perfil público, cualquiera podría registrarse con el email de otra persona.
 *
 * Dos respuestas buenas, según cómo esté configurado Supabase:
 *   · Confirmación encendida → `signUp` no devuelve sesión y Supabase manda el email. Respondemos
 *     `{ ok, pendingConfirmation }` y el modal enseña «Revisa tu correo». El enlace lleva a
 *     `/auth/callback?token_hash=…`, que abre la sesión aunque se pulse en otro dispositivo.
 *   · Confirmación apagada (como estaba) → hay sesión y se entra en el mismo paso.
 * Así el código funciona igual antes y después de encender la confirmación en el panel de prod.
 *
 * Si el email ya tiene cuenta, la respuesta es la misma que para uno nuevo y no sale ningún correo:
 * el formulario no sirve para averiguar quién está registrado. Supabase sí lo dice
 * (`user_already_exists`), así que se traduce aquí. El modal avisa de que, si ya tenías cuenta, no
 * llegará nada y hay que entrar o recuperar la contraseña.
 *
 * El perfil (`profiles`) lo crea el trigger `on_auth_user_created`.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError, safeNext, setSessionFlag } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return json({ ok: false, error: 'Rellena email y contraseña.' }, 400);
    if (password.length < 6) return json({ ok: false, error: mapAuthError('weak_password') }, 400);

    // Solo lo usa la plantilla POR DEFECTO de Supabase (enlace con `?code=`, que exige el mismo
    // navegador). Las nuestras (`supabase/templates/`) llevan `token_hash` y no dependen de esto;
    // se pasa igualmente para que, si un día falta la plantilla en el panel, el enlace siga
    // volviendo a la app en vez de a la raíz.
    const redirectTo = new URL('/auth/callback', url.origin);
    redirectTo.searchParams.set('next', safeNext(typeof body?.next === 'string' ? body.next : '/'));

    const { data, error } = await locals.supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo.toString() },
    });
    // Registrar otra vez un email aún sin confirmar hace que Supabase intente reenviar el correo,
    // y si fue hace menos de un minuto lo frena con `over_email_send_rate_limit`. Para quien pulsa
    // dos veces, «Demasiados intentos» confunde (el correo YA salió), y además delataría que ese
    // email tiene una cuenta a medio crear. Se responde como un registro normal pendiente.
    if (error?.code === 'over_email_send_rate_limit') return json({ ok: true, pendingConfirmation: true });
    if (error?.code === 'user_already_exists' || error?.code === 'email_exists') return json({ ok: true, pendingConfirmation: true });
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 400);

    if (!data.session) return json({ ok: true, pendingConfirmation: true });

    setSessionFlag(cookies);
    return json({ ok: true, isNewUser: true });
};
