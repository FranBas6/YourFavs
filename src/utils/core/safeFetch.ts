/**
 * Envuelve una promesa SSR en un .catch que loguea y devuelve un fallback.
 * Evita que un fallo aislado de TMDB o de la base de datos tire toda la página en cold start.
 *
 * Uso típico dentro de un Promise.all en el frontmatter de una .astro:
 *   safeFetch(getTrending('movie', 'week'), 'home/trending', [] as Movie[])
 */
export const safeFetch = <T>(p: Promise<T>, label: string, fallback: T): Promise<T> =>
    p.catch((err) => {
        console.warn(`[ssr] ${label} falló:`, err?.message || err);
        return fallback;
    });
