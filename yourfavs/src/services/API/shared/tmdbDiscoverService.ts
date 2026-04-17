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

// Cadenas TV / networks (IDs de TMDB, para usar con with_networks en /discover/tv)
export const NETWORKS = [
    { id: 213, name: 'Netflix' },
    { id: 49, name: 'HBO' },
    { id: 1024, name: 'Amazon' },
    { id: 2552, name: 'Apple TV+' },
    { id: 2739, name: 'Disney+' },
    { id: 4, name: 'BBC' },
    { id: 1062, name: 'Movistar+' },
    { id: 174, name: 'AMC' },
    { id: 67, name: 'Showtime' },
    { id: 71, name: 'The CW' },
] as const;

/**
 * Obtener series producidas por una cadena TV específica.
 */
export async function fetchSeriesByNetwork<T>(
    networkId: number,
    page: string = "1"
): Promise<T[]> {
    // Ordenadas por nota (vote_average) con guard de vote_count mínimo
    // para evitar series con 1-2 votos altísimos que no representan calidad real.
    return tmdbFetchList<T>(`/discover/tv`, {
        page,
        with_networks: networkId.toString(),
        sort_by: 'vote_average.desc',
        'vote_count.gte': '100',
    });
}

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

// === Filtros avanzados (C1) ===

export interface AdvancedFilters {
    decade?: string;       // '2020', '2010', '2000', '1990', '1980', '1970'
    year?: string;         // año concreto (tiene prioridad sobre decade)
    rating?: string;       // '7', '8', '9'
    runtime?: 'short' | 'medium' | 'long'; // solo movies
    language?: string;     // código ISO 639-1: 'en', 'es', 'ja', 'ko', 'fr'...
    status?: string;       // solo series: '0' returning, '3' ended, '4' canceled
}

/**
 * Parsea filtros avanzados desde URLSearchParams.
 */
export function parseAdvancedFilters(params: URLSearchParams): AdvancedFilters {
    const f: AdvancedFilters = {};
    const decade = params.get('decade');
    const year = params.get('year');
    const rating = params.get('rating');
    const runtime = params.get('runtime');
    const language = params.get('language');
    const status = params.get('status');
    if (decade) f.decade = decade;
    if (year) f.year = year;
    if (rating) f.rating = rating;
    if (runtime === 'short' || runtime === 'medium' || runtime === 'long') f.runtime = runtime;
    if (language) f.language = language;
    if (status) f.status = status;
    return f;
}

export function hasActiveFilters(f: AdvancedFilters): boolean {
    return !!(f.decade || f.year || f.rating || f.runtime || f.language || f.status);
}

/**
 * Convierte filtros avanzados en params de TMDB /discover.
 * Para series (mediaType='tv') se usa first_air_date en lugar de primary_release_date,
 * y runtime no aplica.
 */
function buildDiscoverParams(f: AdvancedFilters, mediaType: MediaType): Record<string, string> {
    const out: Record<string, string> = {};
    const dateField = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date';

    if (f.year) {
        out[`${dateField}.gte`] = `${f.year}-01-01`;
        out[`${dateField}.lte`] = `${f.year}-12-31`;
    } else if (f.decade) {
        const d = Number(f.decade);
        if (!Number.isNaN(d)) {
            out[`${dateField}.gte`] = `${d}-01-01`;
            out[`${dateField}.lte`] = `${d + 9}-12-31`;
        }
    }

    if (f.rating) {
        out['vote_average.gte'] = f.rating;
        // vote_count.gte se aplica fuera si no ha sido seteado ya
    }

    if (mediaType === 'movie' && f.runtime) {
        if (f.runtime === 'short') out['with_runtime.lte'] = '90';
        else if (f.runtime === 'medium') {
            out['with_runtime.gte'] = '90';
            out['with_runtime.lte'] = '150';
        } else if (f.runtime === 'long') out['with_runtime.gte'] = '150';
    }

    if (f.language) {
        out['with_original_language'] = f.language;
    }

    // with_status solo aplica a /discover/tv
    if (mediaType === 'tv' && f.status) {
        out['with_status'] = f.status;
    }

    return out;
}

/**
 * Filtrado in-memory para endpoints que no soportan /discover (ej: /trending).
 * runtime no aplica porque las listas de TMDB no incluyen runtime (solo details).
 */
export function applyClientFilters<T extends { release_date?: string; first_air_date?: string; vote_average?: number; original_language?: string }>(
    items: T[],
    filters: AdvancedFilters,
    mediaType: MediaType
): T[] {
    if (!hasActiveFilters(filters)) return items;
    return items.filter((item) => {
        const dateStr = mediaType === 'movie' ? item.release_date : item.first_air_date;
        const year = dateStr ? parseInt(dateStr.split('-')[0], 10) : null;

        if (filters.year) {
            if (year !== Number(filters.year)) return false;
        } else if (filters.decade) {
            const d = Number(filters.decade);
            if (year === null || year < d || year > d + 9) return false;
        }
        if (filters.rating) {
            if ((item.vote_average ?? 0) < Number(filters.rating)) return false;
        }
        if (filters.language) {
            if ((item.original_language || '') !== filters.language) return false;
        }
        // runtime y status no existen en listas de TMDB — se ignoran en client-side
        return true;
    });
}

/**
 * Construye params discover extra (sólo filtros avanzados) para combinar
 * con otros params que el caller ya tenga (with_genres, with_watch_providers, etc.).
 */
export function buildDiscoverFilterParams(filters: AdvancedFilters, mediaType: MediaType): Record<string, string> {
    return buildDiscoverParams(filters, mediaType);
}

/**
 * Discover con filtros avanzados. sort_by y vote_count.gte configurables por caller
 * (maspopulares usa popularity.desc, topmovies/topseries usan vote_average.desc).
 */
export async function discoverContent<T>(
    mediaType: MediaType,
    filters: AdvancedFilters,
    options: { sort_by?: string; voteCountMin?: string; page?: string } = {}
): Promise<T[]> {
    const sort_by = options.sort_by || 'popularity.desc';
    const voteCountMin = options.voteCountMin || '100';
    const page = options.page || '1';

    const params: Record<string, string> = {
        page,
        sort_by,
        'vote_count.gte': voteCountMin,
        ...buildDiscoverParams(filters, mediaType),
    };

    return tmdbFetchList<T>(`/discover/${mediaType}`, params);
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
 * Obtener personas en tendencia
 */
export interface TrendingPerson {
    id: number;
    name: string;
    profile_path: string | null;
    popularity: number;
    known_for_department?: string;
    adult?: boolean;
}

export async function getTrendingPeople(
    timeWindow: 'day' | 'week' = 'week'
): Promise<TrendingPerson[]> {
    // Fetch de 3 páginas en paralelo para tener volumen antes de filtrar.
    const [p1, p2, p3] = await Promise.all([
        tmdbFetchList<TrendingPerson>(`/trending/person/${timeWindow}`, { page: '1' }),
        tmdbFetchList<TrendingPerson>(`/trending/person/${timeWindow}`, { page: '2' }),
        tmdbFetchList<TrendingPerson>(`/trending/person/${timeWindow}`, { page: '3' }),
    ]);
    const all = [...p1, ...p2, ...p3];

    // Deduplicar por ID (TMDB a veces repite entre páginas)
    const seen = new Set<number>();
    const unique = all.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
    });

    // Filtros:
    //  - Solo actores (fuera directores/productores)
    //  - Fuera `adult: true`
    //  - Popularidad >= 5 (relajado porque ya tenemos volumen de 3 páginas)
    //  - Debe tener foto de perfil
    return unique
        .filter((p) => p.known_for_department === 'Acting')
        .filter((p) => p.adult !== true)
        .filter((p) => (p.popularity ?? 0) >= 5)
        .filter((p) => !!p.profile_path)
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
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