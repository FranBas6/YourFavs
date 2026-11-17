/**
 * El MODO del catálogo (Todo · Películas · Series) y las URLs que lo arrastran.
 *
 * El modo no filtra una rejilla: decide **qué filtros se le ofrecen al usuario** y **qué filas se
 * pintan**. Vivía suelto en cada página (`urlParams.get('type')`) con seis copias de `buildFilterUrl`
 * y cinco de `buildTypeUrl` byte a byte iguales, y se PERDÍA al navegar de una subpágina a otra.
 *
 * Dónde se recuerda: en una **cookie**, no en el perfil ni en `localStorage`.
 *   · No en el perfil porque el middleware lee ese documento en CADA request y no debe engordar por
 *     una preferencia de navegación.
 *   · No en `localStorage` porque no se puede leer en SSR: o rediriges (parpadeo) o el modo no se
 *     aplica al entrar directo a una URL.
 * La resuelve el middleware (`src/middleware.ts`) y la deja en `Astro.locals.catalogMode`.
 */

export const CATALOG_MODES = ['all', 'movies', 'series', 'people'] as const;
export type CatalogMode = (typeof CATALOG_MODES)[number];

/** Los tres de siempre. `people` solo existe en Tendencias, que es la única con personas. */
export const DEFAULT_CATALOG_MODES: readonly CatalogMode[] = ['all', 'movies', 'series'];

export const CATALOG_MODE_COOKIE = 'yf_catalogo_type';
/** Medio año: es una comodidad, no un ajuste; que caduque sola no rompe nada. */
export const CATALOG_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Filtros que solo tienen sentido en un modo, y que por tanto se limpian de la URL al salir de él.
 * Si no, un `runtime` puesto en Películas seguiría estrechando los resultados en Series con su
 * grupo de filtro escondido: invisible e imposible de quitar.
 */
const MODE_ONLY_FILTERS: Record<string, CatalogMode> = {
    runtime: 'movies',
    cert: 'movies',
    status: 'series',
    // D2: solo de series (duración del episodio, «emiten esta semana»).
    epRuntime: 'series',
    airing: 'series',
};

export function isCatalogMode(v: unknown): v is CatalogMode {
    return typeof v === 'string' && (CATALOG_MODES as readonly string[]).includes(v);
}

/**
 * Modo efectivo de la página: la URL manda (es enlazable y compartible), y si no lo trae, el que
 * recuerde la cookie. `allowed` es lo que ofrece ESTA página: un modo recordado que no exista aquí
 * (p. ej. `people` viniendo de Tendencias) cae a `all` en vez de dejar la página vacía.
 */
export function resolveCatalogMode(
    urlParams: URLSearchParams,
    remembered?: string | null,
    allowed: readonly CatalogMode[] = DEFAULT_CATALOG_MODES,
): CatalogMode {
    const explicit = urlParams.get('type');
    if (isCatalogMode(explicit) && allowed.includes(explicit)) return explicit;
    if (isCatalogMode(remembered) && allowed.includes(remembered)) return remembered;
    return 'all';
}

/**
 * Los dos constructores de URL que necesita cada página de catálogo, sobre sus params actuales.
 *
 * `buildFilterUrl(changes)` aplica cambios parciales conservando el resto (null borra la clave) y
 * vuelve a la página 1. `buildTypeUrl(mode)` cambia de modo y **limpia los filtros que dejan de
 * aplicar**.
 *
 * `resetPage: false` para las páginas sin paginación (Tendencias), que si no arrastrarían un
 * `page=1` que no significa nada.
 */
export function catalogUrls(urlParams: URLSearchParams, options: { resetPage?: boolean } = {}) {
    const { resetPage = true } = options;

    function buildFilterUrl(changes: Record<string, string | null>): string {
        const p = new URLSearchParams(urlParams);
        for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') p.delete(k);
            else p.set(k, v);
        }
        if (resetPage) p.set('page', '1');
        return `?${p.toString()}`;
    }

    function buildTypeUrl(mode: string): string {
        const changes: Record<string, string | null> = { type: mode };
        for (const [param, ownerMode] of Object.entries(MODE_ONLY_FILTERS)) {
            if (mode !== ownerMode) changes[param] = null;
        }
        return buildFilterUrl(changes);
    }

    return { buildFilterUrl, buildTypeUrl };
}

/**
 * Subpáginas del catálogo que ofrecen modos. Las demás (Top películas, Top series, Cartelera, Sagas,
 * Búsqueda) son de un solo tipo, así que escribirles `type` sería un parámetro que no significa nada
 * y que además miente sobre lo que vas a ver ("Top películas" en modo Series).
 *
 * No perder el modo por no escribirlo no es un problema: lo recuerda la cookie. El parámetro en la
 * URL solo hace falta para que un enlace concreto sea compartible.
 */
const MODED_PATHS = [
    '/catalogo',                      // la portada de la sección
    '/catalogo/maspopulares',
    '/catalogo/ultimoslanzamientos',
    '/catalogo/categorias',
    '/catalogo/plataformas',
    '/catalogo/tendencias',
];

/**
 * Comparación por ruta exacta, no por prefijo: `/catalogo` es una ruta con modos, pero
 * `/catalogo/topmovies` no, y con `startsWith` la segunda heredaría de la primera.
 */
function isModedPath(href: string): boolean {
    const path = href.split('?')[0];
    return MODED_PATHS.includes(path) || path.startsWith('/catalogo/keyword/');
}

/**
 * Añade el modo a un enlace de navegación para que sobreviva al salto entre subpáginas: si estás en
 * Series y entras en Plataformas, sigues en Series.
 *
 * `all` no se escribe (es el valor por defecto y ensucia la URL), y un enlace que ya lleve `type`
 * explícito se respeta: es una intención, no un descuido.
 */
export function withMode(href: string, mode?: string): string {
    if (!isCatalogMode(mode) || mode === 'all') return href;
    if (/[?&]type=/.test(href)) return href;
    if (!isModedPath(href)) return href;
    return `${href}${href.includes('?') ? '&' : '?'}type=${mode}`;
}
