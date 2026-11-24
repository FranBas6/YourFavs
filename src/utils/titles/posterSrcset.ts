/**
 * Pósters del tamaño justo (QA 7.4, H58). Las tarjetas miden 124-229 px según dónde vayan y se pedían
 * siempre a 500 px. Con `srcset` el navegador elige 185, 342 o 500 según el ancho real y la densidad de
 * la pantalla. `sizes="auto"` usa el ancho de verdad (solo vale con `loading="lazy"`); los navegadores que
 * no lo entienden usan la regla de detrás (móvil ~180 px, escritorio ~230 px).
 */
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const WIDTHS = ['w185', 'w342', 'w500'] as const;

/** `sizes` para un póster de tarjeta con `loading="lazy"`. */
export const POSTER_SIZES = 'auto, (max-width: 640px) 180px, 230px';

/** `srcset` de un póster de TMDB a partir de su ruta («/abc.jpg»); `undefined` sin ruta. */
export function posterSrcset(path: string | null | undefined): string | undefined {
    if (!path) return undefined;
    return WIDTHS.map((w) => `${IMAGE_BASE}/${w}${path} ${w.slice(1)}w`).join(', ');
}

/** Lo mismo a partir de una URL ya hecha de TMDB («…/t/p/w500/abc.jpg»); `undefined` si no es de TMDB. */
export function posterSrcsetFromUrl(url: string | null | undefined): string | undefined {
    const m = /^https:\/\/image\.tmdb\.org\/t\/p\/w\d+(\/.+)$/.exec(url || '');
    return m ? posterSrcset(m[1]) : undefined;
}
