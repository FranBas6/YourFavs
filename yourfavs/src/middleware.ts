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
import { runWithUser, setRequestPrefs } from './services/BD/shared/userScope';
import { getUserProfile } from './services/BD/profile/userProfile';

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

    // Fallback móvil (Fase C): sin cookie válida, aceptar
    // `Authorization: Bearer <idToken>` (la app nativa NO usa cookies). Verificamos
    // el ID token con el Admin SDK. Es ADITIVO: la web no manda esta cabecera, así
    // que su flujo de cookie de sesión no se ve afectado.
    if (!context.locals.user) {
        const authz = context.request.headers.get('authorization');
        const m = authz?.match(/^Bearer\s+(.+)$/i);
        if (m) {
            try {
                const decoded = await adminAuth.verifyIdToken(m[1]); // ID token, no session cookie
                context.locals.user = {
                    uid: decoded.uid,
                    email: decoded.email ?? null,
                    name: (decoded.name as string | undefined) ?? null,
                    picture: (decoded.picture as string | undefined) ?? null,
                };
            } catch {
                // ID token inválido/caducado → seguimos como invitado (user = null).
                context.locals.user = null;
            }
        }
    }

    // Guard de invitado: las páginas /mislistas/* requieren sesión. Sin ella,
    // de vuelta a inicio (la UX fina del gating — modal "regístrate" — es Fase D).
    const path = context.url.pathname;
    if (!context.locals.user && (path.startsWith('/mislistas') || path.startsWith('/perfil'))) {
        return context.redirect('/');
    }

    // Envolvemos el resto del request en el store de usuario: cualquier llamada a
    // services/BD/** durante este render leerá el uid de aquí (AsyncLocalStorage).
    return runWithUser(context.locals.user?.uid ?? null, async () => {
        // Perfil: si personalizó nombre/avatar, prevalecen sobre los de Google
        // (así el header y el menú reflejan la edición del perfil).
        if (context.locals.user) {
            try {
                const profile = await getUserProfile();
                if (profile?.display_name) context.locals.user.name = profile.display_name;
                if (profile?.avatar_url) context.locals.user.picture = profile.avatar_url;
                context.locals.user.region = profile?.region ?? 'ES'; // para el menú de cuenta
                context.locals.user.onboarding = profile?.onboarding; // gating onboarding (Fase F)
                context.locals.user.platforms = profile?.platforms ?? []; // "mis plataformas" (3.2)
                // Idioma/región del perfil → contexto del request (los leen tmdbFetch y providers).
                setRequestPrefs({ language: profile?.language, region: profile?.region });
            } catch { /* perfil opcional */ }
        }
        return next();
    });
});
