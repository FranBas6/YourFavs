import { tmdbFetchList, type MediaType } from './tmdbClient';

// Proveedores de streaming (IDs de TMDB)
export const PROVIDERS = {
    NETFLIX: 8,
    AMAZON: 119,
    DISNEY: 337,
    HBO: 1899,
    APPLE: 350,
    MOVISTAR: 2241,
    FILMIN: 63,
} as const;

/**
 * Obtener contenido por proveedor de streaming (Netflix, Amazon, etc.)
 */
export async function fetchByProvider<T>(
    mediaType: MediaType,
    providerId: number,
    page: string = "1"
): Promise<T[]> {
    return tmdbFetchList<T>(`/discover/${mediaType}`, {
        page,
        with_watch_providers: providerId.toString(),
        watch_region: 'ES',
        sort_by: 'popularity.desc',
    });
}

/**
 * Obtener contenido más popular
 */
export async function getMostPopular<T extends { popularity: number }>(
    mediaType: MediaType,
    page: string = "1"
): Promise<T[]> {
    const results = await tmdbFetchList<T>(`/${mediaType}/popular`, { page });
    return results.sort((a, b) => b.popularity - a.popularity);
}

/**
 * Obtener contenido mejor valorado (mínimo 50 votos)
 */
export async function getTopRated<T extends { vote_average: number; vote_count?: number; popularity: number }>(
    mediaType: MediaType,
    page: string = "1"
): Promise<T[]> {
    const results = await tmdbFetchList<T>(`/${mediaType}/top_rated`, { page });

    return results
        .filter(item => (item.vote_count ?? 0) >= 50)
        .sort((a, b) => {
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            return b.popularity - a.popularity;
        });
}

/**
 * Obtener contenido trending de la semana
 */
export async function getTrending<T>(
    mediaType: MediaType,
    timeWindow: 'day' | 'week' = 'week'
): Promise<T[]> {
    return tmdbFetchList<T>(`/trending/${mediaType}/${timeWindow}`);
}

/**
 * Buscar contenido por título
 */
export async function searchByTitle<T extends { popularity: number }>(
    mediaType: MediaType,
    title: string,
    page: string = "1"
): Promise<T[]> {
    const results = await tmdbFetchList<T>(`/search/${mediaType}`, {
        query: title,
        page,
    });
    return results.sort((a, b) => b.popularity - a.popularity);
}