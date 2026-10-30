/**
 * GET /auth/callback?code=…&next=/ruta                      (vuelta de Google)
 * GET /auth/callback?token_hash=…&type=email|recovery&next=… (enlaces de los emails)
 *
 * Dos caminos:
 *   · `code`: canjea el código por la sesión. El verificador PKCE está en la cookie que dejó
 *     `/api/auth/google`, así que solo funciona en el MISMO navegador. Para Google da igual.
 *   · `token_hash`: lo traen los enlaces de NUESTRAS plantillas de email (`supabase/templates/`).
 *     `verifyOtp` abre la sesión sin verificador, así que el enlace funciona aunque se abra en el
 *     móvil habiéndose registrado en el ordenador. Antes el reset de contraseña iba por `code` y
 *     tenía justo esa limitación.
 *
 * Vuelve a donde estaba el usuario con `?auth=ok|new|error|link|invite`. Ese parámetro lo recoge
 * `AuthModal` para completar la acción pendiente (guardar algo como invitado), arrancar el
 * onboarding de gustos si la cuenta es nueva, avisar de que el enlace ya no vale (`link`) o de que
 * ahora solo se entra por invitación (`invite`).
 *
 * Cuenta nueva y llegada por el enlace de alguien (F2 social): se sigue a esa persona
 * (`applyReferral`). El handle sale de los metadatos (registro por email) o de la cookie `yf_ref`
 * (Google). Con `SIGNUP_MODE=invite`, una cuenta NUEVA de Google sin invitación se borra en el acto
 * y se vuelve con `?auth=invite`: Google no deja saber antes si la cuenta es nueva.
 */
import type { APIRoute } from 'astro';
import { safeNext, setSessionFlag } from '../../lib/supabase/authHttp';
import { supabaseAdmin } from '../../lib/supabase/admin';
import { signupMode } from '../../lib/social/signupMode';
import { REF_COOKIE, applyReferral, findInviter } from '../../services/BD/social/referral';

export const prerender = false;

/** Una cuenta creada hace menos de esto se considera recién registrada (primer login con Google). */
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
    const next = safeNext(url.searchParams.get('next'));
    const back = (status: 'ok' | 'new' | 'error' | 'link' | 'invite') => {
        const target = new URL(next, url.origin);
        // La página de nueva contraseña no necesita el aviso: ya es el destino del flujo.
        if (next !== '/auth/nueva-contrasena' || status === 'error') target.searchParams.set('auth', status);
        return redirect(target.pathname + target.search, 303);
    };

    // Enlaces del email. `signup` es el nombre viejo de `email`; se aceptan los dos por si una
    // plantilla antigua sigue en el panel.
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    if (tokenHash && (type === 'email' || type === 'signup' || type === 'recovery')) {
        const { data, error } = await locals.supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type === 'recovery' ? 'recovery' : 'email',
        });
        if (error || !data.session) {
            console.error('[auth/callback] enlace de email inválido:', error?.code ?? 'sin sesión');
            return back('link'); // caducado o ya usado: el modal lo explica
        }
        setSessionFlag(cookies);
        if (type === 'recovery') return back('ok');
        // Confirmar el email es, por definición, el primer acceso de una cuenta nueva.
        const ref = (data.user?.user_metadata as Record<string, unknown> | undefined)?.yf_ref;
        await applyReferral(data.session.user.id, typeof ref === 'string' ? ref : cookies.get(REF_COOKIE)?.value);
        cookies.delete(REF_COOKIE, { path: '/' });
        return back('new');
    }

    const code = url.searchParams.get('code');
    if (!code) return back('error'); // Google devolvió un error o el usuario canceló

    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
        console.error('[auth/callback] canje fallido:', error?.message);
        return back('error');
    }

    const isNew = Date.now() - new Date(data.user.created_at).getTime() < NEW_ACCOUNT_WINDOW_MS;
    if (isNew) {
        const refHandle = cookies.get(REF_COOKIE)?.value;
        if (signupMode() === 'invite' && !(await findInviter(refHandle))) {
            // Modo invitación y nadie le invitó: la cuenta recién creada por Google se deshace.
            await locals.supabase.auth.signOut().catch(() => {});
            const { error: delError } = await supabaseAdmin().auth.admin.deleteUser(data.user.id);
            if (delError) console.error('[auth/callback] no se pudo borrar la cuenta sin invitación:', delError.message);
            return back('invite');
        }
        await applyReferral(data.user.id, refHandle);
        cookies.delete(REF_COOKIE, { path: '/' });
    }
    setSessionFlag(cookies);
    return back(isNew ? 'new' : 'ok');
};
