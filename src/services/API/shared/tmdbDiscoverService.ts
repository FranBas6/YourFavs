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
 * Obtener contenido por proveedor de streaming (Netflix, Amazon, etc.)
 */
export async function fetchByProvider<T>(
    mediaType: MediaType,
    providerId: number,
    page: string = "1",
    region: string = 'ES'
): Promise<T[]> {
    return tmdbFetchList<T>(`/discover/${mediaType}`, {
        page,
        with_watch_providers: providerId.toString(),
        watch_region: region,
        sort_by: 'popularity.desc',
    });
}

// === Filtros avanzados (C1) ===

export interface AdvancedFilters {
    decade?: string;       // '2020', '2010', '2000', '1990', '1980', '1970' (legacy)
    year?: string;         // año concreto (tiene prioridad sobre decade)
    yearFrom?: string;     // rango de años: desde (nuevo panel)
    yearTo?: string;       // rango de años: hasta
    rating?: string;       // nota mínima (vote_average.gte): '7', '7.5', '8'…
    runtime?: 'short' | 'medium' | 'long'; // solo movies
    language?: string;     // código ISO 639-1: 'en', 'es', 'ja', 'ko', 'fr'...
    status?: string;       // solo series: '0' returning, '3' ended, '4' canceled
    cert?: string;         // certificación máxima (solo movies, país ES): 'APTA','7','12','16','18'
    sort?: string;         // orden abstracto: 'popular' | 'rating' | 'recent'
    // D2 (2026-10-30)
    origin?: string;       // país de producción ISO-3166 ('ES'): «Hecho en {país}» (with_origin_country)
    epRuntime?: 'short' | 'medium' | 'long'; // solo series: duración del episodio
    airing?: 'week';       // solo series: con algún episodio esta semana
}

/** Mapea un orden abstracto al sort_by correcto de TMDB según el tipo de medio. */
export function sortByFor(sort: string | undefined, mediaType: MediaType): string | undefined {
    if (!sort) return undefined;
    if (sort === 'popular') return 'popularity.desc';
    if (sort === 'rating') return 'vote_average.desc';
    if (sort === 'recent') return mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
    return undefined;
}

/**
 * Parsea filtros avanzados desde URLSearchParams.
 */
export function parseAdvancedFilters(params: URLSearchParams): AdvancedFilters {
    const f: AdvancedFilters = {};
    const decade = params.get('decade');
    const year = params.get('year');
    const yearFrom = params.get('yearFrom');
    const yearTo = params.get('yearTo');
    const rating = params.get('rating');
    const runtime = params.get('runtime');
    const language = params.get('language');
    const status = params.get('status');
    const cert = params.get('cert');
    const sort = params.get('sort');
    const origin = params.get('origin');
    const epRuntime = params.get('epRuntime');
    const airing = params.get('airing');
    if (decade) f.decade = decade;
    if (year) f.year = year;
    if (yearFrom) f.yearFrom = yearFrom;
    if (yearTo) f.yearTo = yearTo;
    if (rating) f.rating = rating;
    if (runtime === 'short' || runtime === 'medium' || runtime === 'long') f.runtime = runtime;
    if (language) f.language = language;
    if (status) f.status = status;
    if (cert) f.cert = cert;
    if (sort) f.sort = sort;
    if (origin && /^[A-Z]{2}$/.test(origin)) f.origin = origin;
    if (epRuntime === 'short' || epRuntime === 'medium' || epRuntime === 'long') f.epRuntime = epRuntime;
    if (airing === 'week') f.airing = 'week';
    return f;
}

// 'sort' es un orden, no un filtro que reduzca resultados → no cuenta como activo.
export function hasActiveFilters(f: AdvancedFilters): boolean {
    return !!(f.decade || f.year || f.yearFrom || f.yearTo || f.rating || f.runtime || f.language || f.status || f.cert
        || f.origin || f.epRuntime || f.airing);
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
    } else if (f.yearFrom || f.yearTo) {
        const from = f.yearFrom || '1900';
        const to = f.yearTo || String(new Date().getFullYear() + 1);
        out[`${dateField}.gte`] = `${from}-01-01`;
        out[`${dateField}.lte`] = `${to}-12-31`;
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
        // Con suelo: `lte=90` a secas mete cortometrajes y títulos sin duración conocida (TMDB los
        // reporta como 0) en un filtro que el usuario lee como «películas cortas». Son 567 títulos de
        // 8.165, medido. 40 min es el mínimo de largometraje; `medium` y `long` ya tenían suelo.
        if (f.runtime === 'short') { out['with_runtime.gte'] = '40'; out['with_runtime.lte'] = '90'; }
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

    // Certificación por edad — solo /discover/movie, país España.
    if (mediaType === 'movie' && f.cert) {
        out['certification_country'] = 'ES';
        out['certification.lte'] = f.cert;
    }

    // D2: «Hecho en {país}» — país de PRODUCCIÓN, no idioma (en español hay mucho de fuera de España).
    if (f.origin) {
        out['with_origin_country'] = f.origin;
    }

    // D2: duración del episodio (series). TMDB filtra por `episode_run_time`. Suelo de 1 min en «cortos»
    // para dejar fuera las series sin duración conocida (TMDB las da como 0).
    if (mediaType === 'tv' && f.epRuntime) {
        if (f.epRuntime === 'short') { out['with_runtime.gte'] = '1'; out['with_runtime.lte'] = '30'; }
        else if (f.epRuntime === 'medium') { out['with_runtime.gte'] = '31'; out['with_runtime.lte'] = '54'; }
        else out['with_runtime.gte'] = '55';
    }

    // D2: series con algún episodio esta semana (de hace 2 días a dentro de 6, hora de Madrid). Fuera
    // noticias y tertulias, que emiten a diario y taparían todo lo demás.
    if (mediaType === 'tv' && f.airing === 'week') {
        const day = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
        out['air_date.gte'] = day(-2);
        out['air_date.lte'] = day(6);
        out['timezone'] = 'Europe/Madrid';
        out['without_genres'] = '10763,10767';
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
        } else if (filters.yearFrom || filters.yearTo) {
            const from = filters.yearFrom ? Number(filters.yearFrom) : -Infinity;
            const to = filters.yearTo ? Number(filters.yearTo) : Infinity;
            if (year === null || year < from || year > to) return false;
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
    options: {
        sort_by?: string; voteCountMin?: string; page?: string; providers?: string; region?: string;
        /**
         * Params de discover que no son "filtros del usuario" y que por tanto no viven en
         * `AdvancedFilters`: los que definen una FILA con criterio propio (`with_type=2` para
         * miniseries, `with_genres`, `vote_average.gte`, `with_runtime.lte`…). Se aplican antes que
         * los filtros, así que si el usuario pone uno que choque, gana el del usuario.
         */
        extraParams?: Record<string, string>;
    } = {}
): Promise<T[]> {
    const sort_by = options.sort_by || 'popularity.desc';
    const voteCountMin = options.voteCountMin || '100';
    const page = options.page || '1';

    const params: Record<string, string> = {
        page,
        sort_by,
        'vote_count.gte': voteCountMin,
        ...(options.extraParams || {}),
        ...buildDiscoverParams(filters, mediaType),
    };
    // Filtro "Solo en mis plataformas" (3.2): with_watch_providers + región.
    if (options.providers) {
        params.with_watch_providers = options.providers;
        params.watch_region = options.region || 'ES';
    }

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