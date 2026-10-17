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
 * Vuelve a donde estaba el usuario con `?auth=ok|new|error|link`. Ese parámetro lo recoge
 * `AuthModal` para completar la acción pendiente (guardar algo como invitado), arrancar el
 * onboarding de gustos si la cuenta es nueva, o avisar de que el enlace ya no vale (`link`).
 */
import type { APIRoute } from 'astro';
import { safeNext, setSessionFlag } from '../../lib/supabase/authHttp';

export const prerender = false;

/** Una cuenta creada hace menos de esto se considera recién registrada (primer login con Google). */
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
    const next = safeNext(url.searchParams.get('next'));
    const back = (status: 'ok' | 'new' | 'error' | 'link') => {
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
        // Confirmar el email es, por definición, el primer acceso de una cuenta nueva.
        return back(type === 'recovery' ? 'ok' : 'new');
    }

    const code = url.searchParams.get('code');
    if (!code) return back('error'); // Google devolvió un error o el usuario canceló

    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
        console.error('[auth/callback] canje fallido:', error?.message);
        return back('error');
    }

    setSessionFlag(cookies);
    const isNew = Date.now() - new Date(data.user.created_at).getTime() < NEW_ACCOUNT_WINDOW_MS;
    return back(isNew ? 'new' : 'ok');
};
