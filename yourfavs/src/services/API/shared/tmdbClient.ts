import { getCurrentLanguage } from '../../BD/shared/userScope';

export const API_KEY = import.meta.env.TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir TMDB_API_KEY en tu .env");
}

export const BASE_URL = "https://api.themoviedb.org/3";
export const IMAGE_BASE = "https://image.tmdb.org/t/p";

// Helpers para construir URLs de imagen TMDB
export const posterUrl = (path: string | null, size: string = "w500") =>
    path ? `${IMAGE_BASE}/${size}${path}` : "";
export const backdropUrl = (path: string | null, size: string = "w780") =>
    path ? `${IMAGE_BASE}/${size}${path}` : "";
export const originalUrl = (path: string | null) =>
    path ? `${IMAGE_BASE}/original${path}` : "";
/** Fotograma de un episodio (`still_path`). w300 es el tamaño que pide el handoff para 16/9. */
export const stillUrl = (path: string | null, size: string = "w300") =>
    path ? `${IMAGE_BASE}/${size}${path}` : "";

export type MediaType = 'movie' | 'tv';

// 5xx de TMDB o su CDN (CloudFront) y 429 (rate limit) suelen ser TRANSITORIOS.
// Los 4xx (401/404…) NO se reintentan.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 1;    // 2 intentos en total (un reintento barato para blips)
const TIMEOUT_MS = 6000;  // corta un upstream colgado: sin esto, un fetch bloqueado espera ~30s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch genérico a la API de TMDB con manejo de errores centralizado.
 * Añade api_key y el idioma del usuario (perfil → contexto ALS; default es-ES).
 * Un `language` explícito en `params` sigue teniendo prioridad.
 *
 * Cada intento tiene TIMEOUT (AbortController): si TMDB se cuelga, cortamos rápido en vez
 * de esperar el timeout del socket (~30s) — clave para que la Home no tarde una eternidad
 * cuando el CDN de TMDB va lento. Un único reintento cubre los 504 esporádicos sin
 * multiplicar la latencia en una caída generalizada. Tras agotar, lanza como antes
 * (los callers como `tmdbFetchList`/`safeFetch` ya lo capturan → sección vacía, sin crash).
 */
export async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const allParams = new URLSearchParams({
        api_key: API_KEY,
        language: getCurrentLanguage(),
        ...params,
    });

    const url = `${BASE_URL}${path}?${allParams.toString()}`;

    for (let attempt = 0; ; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(url, { signal: ctrl.signal });
        } catch (err) {
            clearTimeout(timer);
            const aborted = (err as Error)?.name === 'AbortError';
            // Timeout propio (aborted) → NO reintentar: ya esperamos 6s; reintentar solo dobla la
            // espera y la carga si TMDB va lento. Fallo de red puntual (no-abort) → un reintento.
            if (!aborted && attempt < MAX_RETRIES) { await sleep(250); continue; }
            console.error(`❌ TMDB ${aborted ? 'timeout' : 'red'} [${path}] tras ${attempt + 1} intento(s)`);
            throw err;
        }
        clearTimeout(timer);

        if (res.ok) return res.json() as Promise<T>;

        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
            await res.body?.cancel().catch(() => {}); // libera la conexión antes de reintentar
            await sleep(250);
            continue;
        }

        const errorBody = await res.text();
        // Trunca: un 504 de CloudFront vuelca una página HTML entera que ensucia la consola.
        console.error(`❌ TMDB error [${res.status}] ${path}:`, errorBody.slice(0, 200));
        throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
}

/**
 * Fetch que devuelve directamente el array .results de la respuesta paginada de TMDB.
 */
export async function tmdbFetchList<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
    try {
        const data = await tmdbFetch<{ results: T[] }>(path, params);
        return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
        console.error(`❌ Error al obtener lista desde ${path}:`, error);
        return [];
    }
}
