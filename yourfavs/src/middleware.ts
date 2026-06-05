/**
 * Middleware SSR — corre en CADA request antes de la página/handler.
 *
 * Lee la cookie de sesión, la verifica con el Admin SDK y rellena
 * `Astro.locals.user` (o null si no hay sesión / es inválida). A partir de aquí,
 * cualquier .astro o API route lee `Astro.locals.user` para saber quién es.
 *
 * Verificación LOCAL (checkRevoked = false): no llama a Firebase en cada request
 * (sería lento y caro en Netlify Functions). La revocación se fuerza en logout.
 */
import { defineMiddleware } from 'astro:middleware';
import { adminAuth } from './utils/firebaseAdmin';
import { runWithUser } from './services/BD/shared/userScope';

export const onRequest = defineMiddleware(async (context, next) => {
    context.locals.user = null;

    const session = context.cookies.get('session')?.value;
    if (session) {
        try {
            const decoded = await adminAuth.verifySessionCookie(session, false);
            context.locals.user = {
                uid: decoded.uid,
                email: decoded.email ?? null,
                name: (decoded.name as string | undefined) ?? null,
                picture: (decoded.picture as string | undefined) ?? null,
            };
        } catch {
            // Cookie inválida/caducada → seguimos como invitado (user = null).
            context.locals.user = null;
        }
    }

    // Guard de invitado: las páginas /personal/* requieren sesión. Sin ella,
    // de vuelta a inicio (la UX fina del gating — modal "regístrate" — es Fase D).
    if (!context.locals.user && context.url.pathname.startsWith('/personal')) {
        return context.redirect('/');
    }

    // Envolvemos el resto del request en el store de usuario: cualquier llamada a
    // services/BD/** durante este render leerá el uid de aquí (AsyncLocalStorage).
    return runWithUser(context.locals.user?.uid ?? null, () => next());
});
