/**
 * POST /api/auth/google   { next }   →   { ok, url }
 *
 * Firebase abría Google en un popup; Supabase lo hace con una REDIRECCIÓN de página completa
 * (los popups además los bloquea Safari en iPhone y la app instalada). El servidor pide la URL
 * de Google y guarda en una cookie el verificador PKCE; el cliente navega a esa URL, Google
 * devuelve a Supabase, y Supabase a `/auth/callback`, que canjea el código por la sesión.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError, safeNext } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
    const body = await request.json().catch(() => null);
    const next = safeNext(typeof body?.next === 'string' ? body.next : '/');
    const redirectTo = new URL('/auth/callback', url.origin);
    redirectTo.searchParams.set('next', next);

    const { data, error } = await locals.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) return json({ ok: false, error: mapAuthError(error?.code) }, 500);
    return json({ ok: true, url: data.url });
};
