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
import { createSupabaseServerClient } from './services/db/server';
import { SESSION_FLAG, clearSessionFlag, setSessionFlag } from './services/db/authHttp';
import { runWithUser, setRequestPrefs, startTmdbMeter } from './services/db/userScope';
import { installTmdbMeter, withTmdbReport } from './services/tmdb/tmdbMeter';
import { getUserProfile, resolveSpoilerSettings } from './services/profile/userProfile';
import { CATALOG_MODE_COOKIE, CATALOG_MODE_COOKIE_MAX_AGE, isCatalogMode } from './utils/catalog/catalogUrl';

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
// `/u/` es el perfil público (F1 social): para un invitado es la misma página para todos, perfil
// encendido, apagado o inexistente (404). Con sesión, como todo, `private, no-store`.
const PUBLIC_CACHEABLE_PREFIXES = ['/catalogo', '/movie/', '/serie/', '/actor/', '/team/', '/productora/', '/u/'];
// Rastreo masivo (2026-11-26/27, ~180.000 ejecuciones en un día): para invitados, el navegador guarda 1 min y
// el CDN de Netlify 6 h en su caché DURADERA (compartida por todos sus nodos; con `s-maxage` a secas cada
// nodo pedía la página otra vez). Pasadas las 6 h sirve lo guardado mientras la renueva (hasta 1 día).
const GUEST_CACHE = 'public, max-age=60';
const GUEST_CDN_CACHE = 'public, durable, s-maxage=21600, stale-while-revalidate=86400';

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
        res.headers.set('Netlify-CDN-Cache-Control', GUEST_CDN_CACHE);
        // Sin esto, el CDN podría servirle a un usuario con sesión la versión de invitado que
        // guardó antes (saldría "desconectado"). Los invitados comparten cabecera de cookie, así
        // que no fragmenta; y donde sí la tienen (el modo del catálogo) es que el contenido
        // depende de ella de verdad.
        res.headers.set('Vary', 'Cookie');
    } catch {
        /* respuesta inmutable: se queda como esté */
    }
}

/**
 * Envíos desde otra web (CSRF, QA 5.1, H39). La cookie de sesión es `SameSite=Lax` y los navegadores no la
 * mandan en un POST entre sitios: esa es la primera defensa. Esta es la segunda: cualquier envío
 * (POST/PUT/PATCH/DELETE) cuyo `Origin` (o, sin él, `Referer`) sea de otra web se rechaza. Sin ninguna de
 * las dos (curl, servidores) no hay navegador al que engañar, así que pasa. La app móvil va con
 * `Authorization: Bearer` (no usa cookies, no se le puede falsificar) y queda fuera.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function crossSiteWrite(request: Request, selfOrigin: string): boolean {
    if (!UNSAFE_METHODS.has(request.method)) return false;
    if (/^Bearer\s/i.test(request.headers.get('authorization') ?? '')) return false;
    let from = request.headers.get('origin');
    if (!from) {
        const ref = request.headers.get('referer');
        if (!ref) return false;
        try { from = new URL(ref).origin; } catch { return true; }
    }
    return from !== selfOrigin;
}

/**
 * TEMPORAL (rastreo masivo de 2026-11-26/27): apunta en los registros de la función qué robot pide qué, para
 * saber quién es y si hace caso a robots.txt. Quitar cuando esté resuelto.
 * - `[bot]`: todo lo que se presenta como robot (o no se presenta).
 * - `[visita]`: 1 de cada 20 peticiones que dicen ser un navegador. El 27-11 más del 90 % de las ejecuciones
 *   no dejaban línea `[bot]`: algo se hace pasar por Chrome. `cookies: no` en casi todas = no es una persona
 *   (un navegador de verdad trae al menos la marca de sesión o el modo del catálogo tras la primera página).
 */
const BOT_UA = /bot|crawl|spider|slurp|scrap|fetch|python|curl|wget|http-?client|java\/|go-http|axios|node-fetch|headless|okhttp|libwww/i;
const BROWSER_SAMPLE = 20;
function logBot(request: Request, url: URL): void {
    const ua = request.headers.get('user-agent') ?? '';
    const looksBrowser = !!ua && /Mozilla\//.test(ua) && !BOT_UA.test(ua);
    if (looksBrowser && Math.random() * BROWSER_SAMPLE >= 1) return;
    const ip = request.headers.get('x-nf-client-connection-ip') ?? '';
    const tag = looksBrowser ? `[visita] cookies: ${request.headers.get('cookie') ? 'sí' : 'no'} ·` : '[bot]';
    console.log(`${tag} ${request.method} ${url.pathname}${url.search} · ${ip} · ${ua.slice(0, 160) || '(sin user-agent)'}`);
}

export const onRequest = defineMiddleware(async (context, next) => {
    logBot(context.request, context.url);
    if (crossSiteWrite(context.request, context.url.origin)) {
        return new Response(JSON.stringify({ ok: false, error: 'Envío desde otra web no permitido' }), {
            status: 403, headers: { 'Content-Type': 'application/json' },
        });
    }
    context.locals.user = null;
    let supabase = createSupabaseServerClient(context);

    // Sesión de las cookies. Y, sin ella, el fallback móvil (Fase C): la app nativa NO usa
    // cookies y manda `Authorization: Bearer <access token>`. Es ADITIVO: la web no manda esa
    // cabecera, así que su flujo de cookies no se ve afectado.
    let claims: { sub: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;
    try {
        claims = (await supabase.auth.getClaims()).data?.claims ?? null;
        if (!claims) {
            const bearer = context.request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
            if (bearer) {
                claims = (await supabase.auth.getClaims(bearer)).data?.claims ?? null;
                // Sin cookies, las consultas tienen que llevar el token para que la RLS vea al usuario.
                if (claims) supabase = createSupabaseServerClient(context, bearer);
            }
        }
    } catch {
        claims = null; // sesión inválida/caducada → invitado
    }
    context.locals.supabase = supabase;

    if (claims) {
        const meta = claims.user_metadata ?? {};
        const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
        context.locals.user = {
            uid: claims.sub,
            authId: claims.sub,
            email: claims.email ?? null,
            name: str(meta.full_name) ?? str(meta.name) ?? str(meta.display_name),
            picture: str(meta.avatar_url) ?? str(meta.picture),
            // Con qué entró ('google', 'email'…): Ajustes no debe decir «Google» a quien usa contraseña (QA 1.5, H44).
            provider: str((claims as any).app_metadata?.provider),
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

    // Guard de invitado: /mislistas/* y /perfil/* requieren sesión. Sin ella, a la portada con el modal
    // de entrar abierto y la página de destino (QA 2.6, H67: antes, a la portada en silencio y, tras
    // entrar, sin volver a donde ibas). AuthModal valida `next` (ruta interna) y la usa tras entrar.
    if (!context.locals.user && (path.startsWith('/mislistas') || path.startsWith('/perfil'))) {
        const next = path + context.url.search;
        return context.redirect('/?login=1&next=' + encodeURIComponent(next));
    }

    // Envolvemos el resto del request en el store de usuario: cualquier llamada a
    // services/ que lea la base de datos durante este render leerá el uid de aquí (AsyncLocalStorage).
    return runWithUser(context.locals.user?.uid ?? null, async () => {
        // Solo `astro dev` (C0): cuenta las llamadas a TMDB de esta petición y las resume en consola.
        const tmdbT0 = Date.now();
        const tmdbCalls = import.meta.env.DEV ? (installTmdbMeter(), startTmdbMeter()) : null;
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
                // marcar su opción en SSR. Sin elección previa = 'system', lo mismo que aplica el
                // script anti-FOUC del Layout (QA 1.5).
                context.locals.user.theme = profile?.theme ?? 'system';
                context.locals.user.onboarding = profile?.onboarding; // gating onboarding (Fase F)
                context.locals.user.platforms = profile?.platforms ?? []; // "mis plataformas" (3.2)
                context.locals.user.platformsFilterDefault = profile?.platformsFilterDefault === true;
                // §2 modo sin spoilers: se resuelve AQUÍ (maestro + desglose, con la
                // retrocompatibilidad del booleano viejo) para que ninguna página tenga que
                // saber que existió un formato anterior.
                context.locals.user.spoilers = resolveSpoilerSettings(profile);
                context.locals.user.homeLayout = profile?.homeLayout; // §4 home a tu medida (bloques ocultos)
                context.locals.user.stripPalette = profile?.stripPalette; // 9.4 · paleta de la tira (Layout → <html data-strip>)
                // Perfil público: el menú de cuenta y la hoja Perfil enlazan a /u/{handle} si está activo.
                context.locals.user.publicHandle = profile?.publicHandle;
                context.locals.user.publicVisibility = profile?.publicVisibility ?? 'off';
                // Mensajes M3: el nombre secreto de su canal de tiempo real (lo usa SocialLayer).
                context.locals.user.rtKey = profile?.rtKey;
                // Idioma/región del perfil → contexto del request (los leen tmdbFetch y providers).
                setRequestPrefs({ language: profile?.language, region: profile?.region });
            } catch { /* perfil opcional */ }
        }
        const response = await next();
        applyCacheHeaders(response, path, Boolean(context.locals.user));
        return tmdbCalls ? withTmdbReport(response, path, tmdbCalls, tmdbT0) : response;
    }, { db: supabase, authId: context.locals.user?.authId ?? null });
});
