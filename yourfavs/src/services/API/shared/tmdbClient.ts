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

export type MediaType = 'movie' | 'tv';

/**
 * Fetch genérico a la API de TMDB con manejo de errores centralizado.
 * Añade api_key y el idioma del usuario (perfil → contexto ALS; default es-ES).
 * Un `language` explícito en `params` sigue teniendo prioridad.
 */
export async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const allParams = new URLSearchParams({
        api_key: API_KEY,
        language: getCurrentLanguage(),
        ...params,
    });

    const url = `${BASE_URL}${path}?${allParams.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
        const errorBody = await res.text();
        console.error(`❌ TMDB error [${res.status}] ${path}:`, errorBody);
        throw new Error(`Error en la solicitud: ${res.statusText}`);
    }

    return res.json();
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
