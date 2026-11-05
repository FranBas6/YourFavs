/// <reference path="../.astro/types.d.ts" />

interface SessionUser {
    /** Id del usuario en Supabase Auth (`auth.users.id`), dueño de sus filas. */
    uid: string;
    /** Lo mismo que `uid`. Se mantiene el nombre porque lo usan las rutas de auth y avatar. */
    authId: string;
    email: string | null;
    name: string | null;
    picture: string | null;
    /** Foto del proveedor (Google), antes de que `avatar_url` del perfil la sustituya. */
    providerPicture?: string | null;
    region?: string;   // preferencia del perfil (para el menú de cuenta)
    /** Tema ELEGIDO ('system' = seguir al SO), no el aplicado. Lo pinta la hoja móvil en SSR. */
    theme?: 'light' | 'dark' | 'system';
    onboarding?: 'done' | 'skipped';  // estado del onboarding de gustos (Fase F)
    platforms?: number[];  // provider_ids de "mis plataformas" (Auditoría v2 · 3.2)
    /** Catálogo y ruleta arrancan ya filtrados a `platforms` (Ajustes · A3b). */
    platformsFilterDefault?: boolean;
    /**
     * §2 modo sin spoilers, ya RESUELTO por el middleware (`resolveSpoilerSettings`): quien
     * tenga el booleano viejo `spoilerFree` llega aquí con el desglose equivalente, así que
     * las páginas nunca tienen que mirar el campo antiguo.
     */
    spoilers?: {
        enabled: boolean;
        hideStills: boolean;
        hideSynopsis: boolean;
        hideCalendarTitles: boolean;
    };
    homeLayout?: { key: string; hidden?: boolean }[];  // §4 home a tu medida (bloques ocultos)
    /** Paleta de la tira de episodios (9.4): la pone el Layout en <html data-strip>. */
    stripPalette?: string;
    /** Perfil público (F1 social): para el menú de cuenta y la hoja Perfil («Ver mi perfil»). */
    publicHandle?: string;
    publicVisibility?: 'off' | 'public' | 'friends';
    /** Mensajes M3: tu canal de tiempo real es `u:{rtKey}`. Solo para ti (SocialLayer). */
    rtKey?: string;
}

declare namespace App {
    interface Locals {
        /** Cliente de Supabase de ESTA petición (con sus cookies): la RLS ve a su usuario. */
        supabase: import('./lib/supabase/server').SupabaseServer;
        /** Usuario de la sesión verificada por el middleware; null si es invitado. */
        user: SessionUser | null;
        /**
         * Modo del catálogo (Todo · Películas · Series · Actores) resuelto por el middleware: la URL
         * si lo trae, y si no el último recordado en cookie. Lo leen las páginas de catálogo y los
         * menús de navegación, para que el modo no se pierda al cambiar de subpágina.
         */
        catalogMode: 'all' | 'movies' | 'series' | 'people';
    }
}

interface Window {
    /**
     * Aplica y persiste el tema. Definida en `Layout.astro` y usada por todos los controles
     * (toggle del header, segmentado del menú de escritorio, hoja móvil, Ajustes → Apariencia)
     * para que 'system' signifique lo mismo en todos. Emite `yf:theme` al terminar.
     */
    yfApplyTheme?: (choice: 'light' | 'dark' | 'system') => void;
}

interface ImportMetaEnv {
    // Servidor (privadas)
    readonly TMDB_API_KEY: string;
    // Token de lectura v4: autentica TODAS las llamadas con `Authorization: Bearer` (TMDB E4; sin él,
    // `TMDB_API_KEY`) y permite «Importar desde tu cuenta de TMDB» (D3c; sin él, sale «Pronto»).
    readonly TMDB_READ_TOKEN?: string;
    // Client ID de la app de Trakt (lote F2; login PKCE, sin secreto). Sin él, «Desde tu cuenta de
    // Trakt» sale como «Pronto». La app de Trakt es «Development»: solo vale en localhost.
    readonly TRAKT_CLIENT_ID?: string;
    // Solo desarrollo: un Trakt de mentira para probar la importación sin cuenta. En prod se ignora.
    readonly TRAKT_FAKE_URL?: string;
    // Supabase (todas de servidor: el navegador no habla con Supabase)
    readonly SUPABASE_URL: string;
    readonly SUPABASE_PUBLISHABLE_KEY: string;
    readonly SUPABASE_SECRET_KEY: string;
    // Quién ve /admin/reportes (uids separados por comas). Sin ella, nadie.
    readonly ADMIN_UIDS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
