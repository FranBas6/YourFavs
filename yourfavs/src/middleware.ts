/**
 * Middleware SSR — corre en CADA request antes de la página/handler.
 *
 * Crea el cliente de Supabase de la petición (`locals.supabase`), valida la sesión de sus
 * cookies y rellena `Astro.locals.user` (o null si no hay sesión / es inválida). A partir de
 * aquí, cualquier .astro o API route lee `Astro.locals.user` para saber quién es.
 *
 * `getClaims()` valida el JWT y, si está a punto de caducar, lo REFRESCA y reescribe las cookies
 * aquí, antes de renderizar. Eso sustituye a la "sesión continua" que antes hacía el cliente con
 * un POST a /api/auth/session en cada página.
 */
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase/server';
import { SESSION_FLAG, clearSessionFlag, setSessionFlag } from './lib/supabase/authHttp';
import { runWithUser, setRequestPrefs } from './services/BD/shared/userScope';
import { getUserProfile, resolveSpoilerSettings } from './services/BD/profile/userProfile';
import { CATALOG_MODE_COOKIE, CATALOG_MODE_COOKIE_MAX_AGE, isCatalogMode } from './utils/catalogUrl';

/**
 * Rutas que para un INVITADO son contenido público y merecen caché de CDN.
 *
 * Con sesión, ninguna lo es: la portada lleva tu nombre y tu «Estás viendo», y las fichas de
 * peli/serie/actor llevan en qué listas tienes el título, tu nota y tu progreso. Antes esto lo
 * decidía `netlify.toml` por ruta (`for = "/"` con `public, s-maxage=300`), que no puede saber si
 * hay sesión → la portada personalizada era cacheable por el CDN COMPARTIDO. La regla que debía
 * evitarlo apuntaba a `/personal/*`, ruta que dejó de existir al renombrar a `/mislistas/*`.
 *
 * Ahora la decisión vive aquí, que es el único sitio que sabe si hay sesión, y `netlify.toml` ya
 * no declara caché para estas rutas (así no hay dos fuentes de verdad peleándose).
 */
const PUBLIC_CACHEABLE_PREFIXES = ['/catalogo', '/movie/', '/serie/', '/actor/'];
const GUEST_CACHE = 'public, s-maxage=300, max-age=60, stale-while-revalidate=600';

function applyCacheHeaders(res: Response, path: string, hasSession: boolean): void {
    try {
        // Si la página o el endpoint ya decidió su caché, manda ella.
        if (res.headers.has('cache-control')) return;
        if (hasSession) {
            res.headers.set('Cache-Control', 'private, no-store');
            return;
        }
        const cacheable = path === '/' || PUBLIC_CACHEABLE_PREFIXES.some((p) => path.startsWith(p));
        if (!cacheable) return;
        res.headers.set('Cache-Control', GUEST_CACHE);
        // Sin esto, el CDN podría servirle a un usuario con sesión la versión de invitado que
        // guardó antes (saldría "desconectado"). Los invitados comparten cabecera de cookie, así
        // que no fragmenta; y donde sí la tienen (el modo del catálogo) es que el contenido
        // depende de ella de verdad.
        res.headers.set('Vary', 'Cookie');
    } catch {
        /* respuesta inmutable: se queda como esté */
    }
}

export const onRequest = defineMiddleware(async (context, next) => {
    context.locals.user = null;
    const supabase = createSupabaseServerClient(context);
    context.locals.supabase = supabase;

    // Sesión de las cookies. Y, sin ella, el fallback móvil (Fase C): la app nativa NO usa
    // cookies y manda `Authorization: Bearer <access token>`. Es ADITIVO: la web no manda esa
    // cabecera, así que su flujo de cookies no se ve afectado.
    let claims: { sub: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
    try {
        claims = (await supabase.auth.getClaims()).data?.claims ?? null;
        if (!claims) {
            const bearer = context.request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
            if (bearer) claims = (await supabase.auth.getClaims(bearer)).data?.claims ?? null;
        }
    } catch {
        claims = null; // sesión inválida/caducada → invitado
    }

    if (claims) {
        const meta = claims.user_metadata ?? {};
        const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
        // TRANSICIÓN (Fase 3 → 4): los datos siguen en Firestore bajo el uid de FIREBASE. Las
        // cuentas migradas guardan ese uid en `profiles.firebase_uid`, así que el `uid` que ve
        // la app (y con el que lee Firestore) es ese; `authId` es el de Supabase. En la Fase 4
        // los dos pasan a ser el de Supabase y esta consulta desaparece.
        let dataUid = claims.sub;
        try {
            const { data } = await supabase.from('profiles').select('firebase_uid').eq('id', claims.sub).maybeSingle();
            if (data?.firebase_uid) dataUid = data.firebase_uid;
        } catch { /* sin perfil: se queda el uid de Supabase */ }
        context.locals.user = {
            uid: dataUid,
            authId: claims.sub,
            email: claims.email ?? null,
            name: str(meta.full_name) ?? str(meta.name) ?? str(meta.display_name),
            picture: str(meta.avatar_url) ?? str(meta.picture),
        };
    }

    // Bandera legible para el gating del cliente: que diga la verdad (ver authHttp.ts).
    const flag = context.cookies.get(SESSION_FLAG)?.value;
    if (context.locals.user && !flag) setSessionFlag(context.cookies);
    else if (!context.locals.user && flag) clearSessionFlag(context.cookies);

    const path = context.url.pathname;

    // Modo del catálogo (Todo · Películas · Series): la URL manda, y si no lo trae, lo recuerda una
    // cookie. Se resuelve AQUÍ para que lo tengan también los menús de navegación, que se pintan en
    // todas las páginas y son los que tienen que arrastrarlo al saltar de subpágina. Solo escribe
    // cuando el usuario lo elige explícitamente en el catálogo, y solo si cambió: así el caso normal
    // (navegar con el mismo modo) no emite `Set-Cookie` y sigue siendo cacheable para invitados.
    const explicitMode = path.startsWith('/catalogo') ? context.url.searchParams.get('type') : null;
    if (isCatalogMode(explicitMode)) {
        context.locals.catalogMode = explicitMode;
        if (context.cookies.get(CATALOG_MODE_COOKIE)?.value !== explicitMode) {
            context.cookies.set(CATALOG_MODE_COOKIE, explicitMode, {
                path: '/',
                maxAge: CATALOG_MODE_COOKIE_MAX_AGE,
                sameSite: 'lax',
            });
        }
    } else {
        const remembered = context.cookies.get(CATALOG_MODE_COOKIE)?.value;
        context.locals.catalogMode = isCatalogMode(remembered) ? remembered : 'all';
    }

    // Guard de invitado: las páginas /mislistas/* requieren sesión. Sin ella,
    // de vuelta a inicio (la UX fina del gating — modal "regístrate" — es Fase D).
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
                // `providerPicture` guarda la foto del proveedor ANTES de que la pise el perfil:
                // es lo que hay que volver a pintar si el usuario quita su avatar, y el cliente
                // no tiene otra forma de conocerla.
                context.locals.user.providerPicture = context.locals.user.picture;
                if (profile?.avatar_url) context.locals.user.picture = profile.avatar_url;
                context.locals.user.region = profile?.region ?? 'ES'; // para el menú de cuenta
                // Tema ELEGIDO (no el aplicado): lo necesita el segmentado de la hoja móvil para
                // marcar su opción en SSR. Sin elección previa = 'light', que es lo que aplica el
                // script anti-FOUC del Layout desde siempre.
                context.locals.user.theme = profile?.theme ?? 'light';
                context.locals.user.onboarding = profile?.onboarding; // gating onboarding (Fase F)
                context.locals.user.platforms = profile?.platforms ?? []; // "mis plataformas" (3.2)
                context.locals.user.platformsFilterDefault = profile?.platformsFilterDefault === true;
                // §2 modo sin spoilers: se resuelve AQUÍ (maestro + desglose, con la
                // retrocompatibilidad del booleano viejo) para que ninguna página tenga que
                // saber que existió un formato anterior.
                context.locals.user.spoilers = resolveSpoilerSettings(profile);
                context.locals.user.homeLayout = profile?.homeLayout; // §4 home a tu medida (bloques ocultos)
                // Idioma/región del perfil → contexto del request (los leen tmdbFetch y providers).
                setRequestPrefs({ language: profile?.language, region: profile?.region });
            } catch { /* perfil opcional */ }
        }
        const response = await next();
        applyCacheHeaders(response, path, Boolean(context.locals.user));
        return response;
    }, { db: supabase, authId: context.locals.user?.authId ?? null });
});
