/**
 * GET /auth/callback?code=…&next=/ruta
 *
 * Vuelta de Google y de los enlaces del email (restablecer contraseña). Canjea el código por la
 * sesión —el verificador PKCE está en la cookie que dejó `/api/auth/google` o `/api/auth/reset`—
 * y vuelve a donde estaba el usuario con `?auth=ok|new|error`. Ese parámetro lo recoge
 * `AuthModal` para completar la acción pendiente (guardar algo como invitado) o arrancar el
 * onboarding de gustos si la cuenta es nueva, lo mismo que hacía tras el popup de Firebase.
 */
import type { APIRoute } from 'astro';
import { safeNext, setSessionFlag } from '../../lib/supabase/authHttp';

export const prerender = false;

/** Una cuenta creada hace menos de esto se considera recién registrada (primer login con Google). */
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
    const next = safeNext(url.searchParams.get('next'));
    const back = (status: 'ok' | 'new' | 'error') => {
        const target = new URL(next, url.origin);
        // La página de nueva contraseña no necesita el aviso: ya es el destino del flujo.
        if (next !== '/auth/nueva-contrasena' || status === 'error') target.searchParams.set('auth', status);
        return redirect(target.pathname + target.search, 303);
    };

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
