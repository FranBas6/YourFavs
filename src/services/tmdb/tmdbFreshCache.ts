/**
 * Respuestas de TMDB guardadas SOLO mientras TMDB dice que son válidas (QA 7.1, H83), para lo que no
 * cabe en `tmdb_cache` (esa tabla es de fichas de película y serie): sagas (`/collection/{id}`) y
 * temporadas (`/tv/{id}/season/{n}`).
 *
 * Misma regla que `tmdbTitleCache.ts`: TMDB sirve estas respuestas desde su CDN con `Cache-Control:
 * max-age` y `Age`; mientras no caducan, pedirlas otra vez devuelve EXACTAMENTE lo mismo. Se guardan
 * hasta ese momento y ni un segundo más; sin cabecera de caché (o con menos de un minuto), no se guardan.
 *
 * Dos capas: memoria de la instancia (L1) y Netlify Blobs (L2, compartida entre instancias: una
 * instancia recién arrancada no vuelve a pedir lo que otra ya pidió). Si Blobs no está, solo L1.
 */
import { getCached, setCached } from '../cache/recsBlobCache';
import { getCurrentLanguage } from '../db/userScope';
import { tmdbFetchWithFreshness } from './tmdbClient';

const MIN_FRESH_MS = 60_000;
const L1_MAX = 600;
const l1 = new Map<string, { data: unknown; expires: number }>();

function keyFor(path: string, params: Record<string, string>): string {
    const language = params.language ?? getCurrentLanguage();
    const rest = Object.entries(params).filter(([k]) => k !== 'language').sort(([a], [b]) => a.localeCompare(b));
    const q = new URLSearchParams(rest).toString();
    return `tmdbfresh/${language || 'sin-idioma'}${path}${q ? `?${q}` : ''}`;
}

/** Como `tmdbFetch`, pero reutilizando la respuesta mientras TMDB la dé por buena. Lanza si TMDB falla. */
export async function tmdbFetchFresh<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const key = keyFor(path, params);
    const now = Date.now();
    const hit = l1.get(key);
    if (hit && hit.expires > now) return hit.data as T;

    const shared = await getCached<{ data: T; expires: number }>(key);
    if (shared && shared.expires > now) {
        remember(key, shared.data, shared.expires);
        return shared.data;
    }

    const { data, freshForMs } = await tmdbFetchWithFreshness<T>(path, params);
    if (freshForMs >= MIN_FRESH_MS) {
        const expires = now + freshForMs;
        remember(key, data, expires);
        void setCached(key, { data, expires }, freshForMs);
    }
    return data;
}

function remember(key: string, data: unknown, expires: number): void {
    if (l1.size >= L1_MAX) l1.delete(l1.keys().next().value as string); // la más antigua
    l1.set(key, { data, expires });
}
