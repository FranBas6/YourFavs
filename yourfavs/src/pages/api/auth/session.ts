/**
 * POST /api/auth/session
 * Body JSON: { idToken }
 *
 * El navegador hace login con Firebase Auth (Google / email+password) y obtiene
 * un ID token de corta vida. Lo manda aquí; verificamos con el Admin SDK y
 * emitimos una SESSION COOKIE HttpOnly de larga vida. A partir de ahí el
 * middleware identifica al usuario en cada request sin volver a llamar a Firebase.
 *
 * Por qué cookie de sesión y no guardar el ID token: el ID token caduca en ~1h y
 * vive en JS (vulnerable a XSS). La session cookie es HttpOnly (inaccesible a JS),
 * dura más y se verifica en servidor.
 */
import type { APIRoute } from 'astro';
import { adminAuth } from '../../../utils/firebaseAdmin';

export const prerender = false;

// Firebase permite cookies de sesión de 5 min a 14 días. 14 días = mejor UX para
// una app personal de "guardar tus pelis" (riesgo bajo); ajustable aquí.
const SESSION_DAYS = 14;
const EXPIRES_IN_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const body = await request.json().catch(() => null);
        const idToken = body?.idToken;
        if (typeof idToken !== 'string' || !idToken) {
            return json({ ok: false, error: 'Falta idToken' }, 400);
        }

        // Verifica el ID token antes de emitir la cookie (rechaza tokens inválidos
        // o caducados). checkRevoked: true para no aceptar tokens ya revocados.
        await adminAuth.verifyIdToken(idToken, true);

        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS });

        cookies.set('session', sessionCookie, {
            httpOnly: true,                          // inaccesible a JS → mitiga XSS
            secure: import.meta.env.PROD,            // solo HTTPS en prod; en local (http) iría sin secure
            sameSite: 'lax',                         // se envía en navegación normal, no en cross-site
            path: '/',
            maxAge: EXPIRES_IN_MS / 1000,            // en segundos
        });

        // Flag LEGIBLE por JS (no es secreto): le dice al cliente que hay sesión
        // sin exponer la cookie HttpOnly → así el invitado no descarga firebase/auth.
        cookies.set('has_session', '1', {
            httpOnly: false,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
            path: '/',
            maxAge: EXPIRES_IN_MS / 1000,
        });

        return json({ ok: true }, 200);
    } catch (err) {
        console.error('[api/auth/session] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo iniciar sesión' }, 401);
    }
};

function json(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
