import { type Serie } from "../../../types/ApiSerie.ts";
import { tmdbFetch, API_KEY, posterUrl, backdropUrl, originalUrl } from '../shared/tmdbClient';
import { getCurrentLanguage, getCurrentRegion } from "../../BD/shared/userScope";
import { getGenreName } from "../../../utils/constants/genres";
import {
    getTrailer as sharedGetTrailer,
    getVideos as sharedGetVideos,
    getAdditionalInfo as sharedGetAdditionalInfo,
    getDirectorsAndRoles as sharedGetDirectorsAndRoles,
    mapAndDeduplicateProviders,
    buildProvidersByCountry,
    buildProviderLinksByCountry,
    getRecommendationsOrSimilar as sharedGetRecommendationsOrSimilar,
    buildAdditionalInfo,
    crewByRoles,
    mergeReviews,
    ownLanguageFirst,
    pickBestTrailerKey,
    pickTitleLogo,
    videoLanguages,
} from '../shared/tmdbInfoService';

const BASE_URL = "https://api.themoviedb.org/3";

// --- Funciones únicas de series ---

/** «Disponible en España»: alguna plataforma (suscripción, alquiler o compra) y traducción es-ES. */
function isAvailableInSpain(providersResults: any, translations: any[] | undefined): boolean {
    const esProviders = providersResults?.[getCurrentRegion()] || providersResults?.ES || {};
    const hasProvider = esProviders.flatrate?.length > 0 || esProviders.rent?.length > 0 || esProviders.buy?.length > 0;
    const hasSpanishTranslation = (translations || []).some((t: any) => t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES');
    return hasProvider && hasSpanishTranslation;
}

async function checkSeriesSpanishAvailability(seriesId: string): Promise<boolean> {
    try {
        const providersUrl = `${BASE_URL}/tv/${seriesId}/watch/providers?api_key=${API_KEY}`;
        const providersRes = await fetch(providersUrl);

        if (!providersRes.ok) return false;

        const providersData = await providersRes.json();
        const esProviders = providersData.results?.[getCurrentRegion()] || providersData.results?.ES || {};
        const hasProvider = esProviders.flatrate?.length > 0 ||
            esProviders.rent?.length > 0 ||
            esProviders.buy?.length > 0;

        const translationsUrl = `${BASE_URL}/tv/${seriesId}/translations?api_key=${API_KEY}`;
        const translationsRes = await fetch(translationsUrl);

        let hasSpanishTranslation = false;
        if (translationsRes.ok) {
            const translationsData = await translationsRes.json();
            const translations = translationsData.translations || [];
            hasSpanishTranslation = translations.some((t: any) =>
                t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES'
            );
        }

        return hasProvider && hasSpanishTranslation;
    } catch (error) {
        console.error(`Error verificando disponibilidad en España para serie ${seriesId}:`, error);
        return false;
    }
}

export const getSeriesById = async ({ id }: { id: string }) => {
    const [serie, providersData] = await Promise.all([
        tmdbFetch<Serie>(`/tv/${id}`),
        tmdbFetch<{ results: any }>(`/tv/${id}/watch/providers`, {}),
    ]);

    const esProviders = providersData.results?.[getCurrentRegion()] || providersData.results?.ES || {};
    serie.availableInSpain = await checkSeriesSpanishAvailability(id);
    serie.providers = mapAndDeduplicateProviders(esProviders);
    (serie as any).providersByCountry = buildProvidersByCountry(providersData.results);
    (serie as any).providerLinksByCountry = buildProviderLinksByCountry(providersData.results);

    return serie;
};

/**
 * Providers de UNA temporada concreta.
 *
 * Por qué existe: `/tv/{id}/watch/providers` devuelve la UNIÓN de todas las temporadas, así que
 * una serie cuya T1 está en Prime y cuyo resto solo está en Apple TV aparecía como si toda
 * estuviera incluida en Prime (caso real: Silo en España). TMDB sí expone el dato por temporada
 * y con el mismo shape, así que se reutilizan los tres builders de título tal cual.
 */
export const getSeasonWatchProviders = async (
    serieId: string | number,
    seasonNumber: number,
): Promise<{ providersByCountry: Record<string, any[]>; linkByCountry: Record<string, string> }> => {
    try {
        const data = await tmdbFetch<{ results: any }>(`/tv/${serieId}/season/${seasonNumber}/watch/providers`, {});
        return {
            providersByCountry: buildProvidersByCountry(data.results),
            linkByCountry: buildProviderLinksByCountry(data.results),
        };
    } catch (error) {
        console.error(`Error al obtener providers de T${seasonNumber} de la serie ${serieId}:`, error);
        return { providersByCountry: {}, linkByCountry: {} };
    }
};

interface CastMember {
    id: number;
    name: string;
    character: string;
    profile_path?: string;
}

export const getSeriesCast = async (tvId: string): Promise<CastMember[]> => {
    try {
        const seriesData = await tmdbFetch<{ number_of_seasons: number }>(`/tv/${tvId}`);
        const totalSeasons = seriesData.number_of_seasons;
        const allCast = new Map<number, CastMember>();

        const seasonNumbers = Array.from({ length: totalSeasons }, (_, i) => i + 1);
        const results = await Promise.all(
            seasonNumbers.map(season =>
                tmdbFetch<{ cast?: any[] }>(`/tv/${tvId}/season/${season}/credits`).catch(() => ({ cast: [] as any[] }))
            )
        );

        for (const data of results) {
            data.cast?.forEach((actor: any) => {
                if (!allCast.has(actor.id)) {
                    allCast.set(actor.id, {
                        id: actor.id,
                        name: actor.name,
                        character: actor.character || '',
                        profile_path: actor.profile_path || null,
                    });
                }
            });
        }

        return Array.from(allCast.values());
    } catch (error) {
        console.error(`Error al obtener el reparto de la serie ${tvId}:`, error);
        return [];
    }
};

export const getSeriesStatus = async (seriesId: string): Promise<string | null> => {
    try {
        const data = await tmdbFetch<{ status: string }>(`/tv/${seriesId}`);
        return data.status || null;
    } catch (error) {
        console.error("Error al obtener el estado de la serie:", error);
        return null;
    }
};

export async function getEpisodesBySeasonNumber(serieId: number | string, seasonNumber: number): Promise<any[]> {
    try {
        const data = await tmdbFetch<{ episodes?: any[] }>(`/tv/${serieId}/season/${seasonNumber}`);
        return data.episodes || [];
    } catch (error) {
        console.error("Error en getEpisodesBySeasonNumber:", error);
        return [];
    }
}

// Interfaz para la respuesta original de TMDB
interface TMDBPosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

export interface PosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

export const fetchAllSeriesPosters = async (
    serieId: string | number,
    language: string = getCurrentLanguage()
): Promise<PosterImage[]> => {
    const numericId = typeof serieId === 'string' ? parseInt(serieId, 10) : serieId;
    const fullImagePath = (path: string) => originalUrl(path);

    try {
        const seriesData = await tmdbFetch<{ seasons: any[] }>(`/tv/${numericId}`, {});
        const seasons = seriesData.seasons || [];

        const fetchImages = (url: string) =>
            fetch(url)
                .then(r => r.json())
                .catch(() => ({ posters: [] }));

        const [seriesImagesData, ...seasonResults] = await Promise.all([
            fetchImages(`${BASE_URL}/tv/${numericId}/images?api_key=${API_KEY}`),
            ...seasons.map((season: any) =>
                fetchImages(`${BASE_URL}/tv/${numericId}/season/${season.season_number}/images?api_key=${API_KEY}`)
            ),
        ]);

        let posters: TMDBPosterImage[] = seriesImagesData.posters || [];
        for (const seasonImagesData of seasonResults) {
            if (Array.isArray(seasonImagesData.posters)) {
                posters = posters.concat(seasonImagesData.posters);
            }
        }

        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path),
        }));
    } catch (error) {
        console.error(`Error al obtener los pósters de la serie ${numericId}:`, error);
        return [];
    }
};

// --- Funciones delegadas a módulos compartidos ---

const SERIES_CREW_ROLES = [
    "Director", "Producer", "Executive Producer", "Visual Effects", "Original Music Composer"
];

export const getSeriesDirectorsAndRoles = async (tvId: string) =>
    sharedGetDirectorsAndRoles('tv', tvId, SERIES_CREW_ROLES);

export const getSeriesTrailer = async (seriesId: string) =>
    sharedGetTrailer('tv', seriesId);

export const getSeriesVideos = async (seriesId: string) =>
    sharedGetVideos('tv', seriesId);

export const getSeriesAdditionalInfo = async (seriesId: string) =>
    sharedGetAdditionalInfo('tv', seriesId);

// --- Ficha en pocas llamadas (C2, 2026-10-29) ---

export interface SeriesBundle {
    /** `/tv/{id}` crudo + lo que añadía `getSeriesById` (proveedores y «disponible en España»). */
    item: any;
    /** Reparto: unión de los repartos de cada temporada (1…number_of_seasons), como `getSeriesCast`. */
    cast: CastMember[];
    directors: { name: string; job: string }[];
    trailerUrl: string | null;
    videos: any[];
    status: string | null;
    /** Episodios por número de temporada (todas, incluida la 0), como `getEpisodesBySeasonNumber`. */
    seasonEpisodes: Record<number, any[]>;
    /** Pósters de la serie y luego de cada temporada, idioma del perfil o sin idioma, URL original. */
    posters: PosterImage[];
    logo: string | null;
    additionalInfo: Record<string, any>;
    externalIds: any;
    reviews: { results: any[] };
    keywords: { id: number; name: string }[];
}

/** Sub-recursos fijos de la serie en la llamada principal. */
const SERIES_APPEND = ['credits', 'videos', 'images', 'keywords', 'content_ratings', 'external_ids', 'translations', 'reviews', 'watch/providers'];
/** TMDB admite como mucho 20 sub-recursos en `append_to_response`. */
const APPEND_MAX = 20;
/** Temporadas que se piden «a ciegas» en la primera llamada (las que no existan no vienen, sin error). */
const SPECULATIVE_SEASONS = [0, 1, 2];

const seasonSubs = (n: number, withCredits: boolean) =>
    [`season/${n}`, `season/${n}/images`, ...(withCredits ? [`season/${n}/credits`] : [])];

/**
 * Todo lo público de la ficha de serie con `append_to_response`, que en series admite también
 * `season/{n}`, `season/{n}/images` y `season/{n}/credits` (comprobado: mismo contenido que las
 * llamadas sueltas). Antes la ficha hacía `/tv/{id}` ×5 y, POR TEMPORADA, episodios + imágenes +
 * reparto (Juego de Tronos 75 llamadas, Padre de familia 139 y 6,4 s en frío).
 *
 * 1) Llamada principal: los 9 sub-recursos fijos + las temporadas 0, 1 y 2 a ciegas, y en paralelo
 *    las reseñas inglesas (dentro del append heredarían el idioma del perfil).
 * 2) Con la lista real de temporadas, lo que falte se pide en bloques de 20 sub-recursos, todos a
 *    la vez (Juego de Tronos: 1 bloque; Padre de familia: 3).
 *
 * Cada campo devuelto tiene la forma de las funciones sueltas (`getSeriesById`, `getSeriesCast`,
 * `getSeriesDirectorsAndRoles`, `getSeriesTrailer`, `getSeriesVideos`, `getSeriesStatus`,
 * `getEpisodesBySeasonNumber`, `fetchAllSeriesPosters`, `getTitleLogo`, `getSeriesAdditionalInfo`,
 * `getReviews`). Los proveedores POR TEMPORADA siguen en `seasonProviders.ts` (caché L1+L2 24 h).
 * Devuelve `null` si la serie no existe o TMDB falla.
 */
export async function getSeriesBundle(seriesId: string | number): Promise<SeriesBundle | null> {
    const own = getCurrentLanguage().slice(0, 2);
    const params = {
        // Pósters: idioma del perfil o sin idioma. Logo: es > en > sin idioma (como `getTitleLogo`).
        include_image_language: [...new Set([own, 'es', 'en'])].join(',') + ',null',
        include_video_language: videoLanguages(),
    };
    const firstSubs = [...SERIES_APPEND, ...SPECULATIVE_SEASONS.flatMap((n) => seasonSubs(n, n > 0))];

    let data: any;
    let enReviews: { results?: any[] };
    try {
        [data, enReviews] = await Promise.all([
            tmdbFetch<any>(`/tv/${seriesId}`, { ...params, append_to_response: firstSubs.join(',') }),
            own === 'en'
                ? Promise.resolve({ results: [] })
                : tmdbFetch<{ results: any[] }>(`/tv/${seriesId}/reviews`, { language: 'en-US' }).catch(() => ({ results: [] })),
        ]);
    } catch (error) {
        console.error(`❌ Error al obtener la ficha de la serie ${seriesId}:`, error);
        return null;
    }
    if (!data?.id) return null;

    // Sub-recursos de temporada recibidos (`season/3`, `season/3/images`…), de todas las llamadas.
    const seasonParts: Record<string, any> = {};
    const takeSeasonParts = (src: any) => {
        for (const k of Object.keys(src || {})) if (k.startsWith('season/')) seasonParts[k] = src[k];
    };
    takeSeasonParts(data);

    const seasonNumbers: number[] = (data.seasons || []).map((x: any) => x.season_number);
    const creditSeasons = Array.from({ length: data.number_of_seasons || 0 }, (_, i) => i + 1);
    const pending = [
        ...seasonNumbers.flatMap((n) => [`season/${n}`, `season/${n}/images`]),
        ...creditSeasons.map((n) => `season/${n}/credits`),
    ].filter((k) => !firstSubs.includes(k));
    const blocks: string[][] = [];
    for (let i = 0; i < pending.length; i += APPEND_MAX) blocks.push(pending.slice(i, i + APPEND_MAX));
    const blockData = await Promise.all(blocks.map((subs) =>
        tmdbFetch<any>(`/tv/${seriesId}`, { ...params, append_to_response: subs.join(',') }).catch(() => ({})),
    ));
    blockData.forEach(takeSeasonParts);

    const { credits, videos, images, keywords, content_ratings, external_ids, translations, reviews, ...rest } = data;
    const providers = data['watch/providers']?.results;
    const detail: any = {};
    for (const [k, v] of Object.entries(rest)) if (!k.includes('/')) detail[k] = v;

    const item = {
        ...detail,
        availableInSpain: isAvailableInSpain(providers, translations?.translations),
        providers: mapAndDeduplicateProviders(providers?.[getCurrentRegion()] || providers?.ES || {}),
        providersByCountry: buildProvidersByCountry(providers),
        providerLinksByCountry: buildProviderLinksByCountry(providers),
    };

    // Reparto: el primero que aparece manda (temporada 1 antes que la 2…), como `getSeriesCast`.
    const allCast = new Map<number, CastMember>();
    for (const n of creditSeasons) {
        for (const actor of seasonParts[`season/${n}/credits`]?.cast || []) {
            if (!allCast.has(actor.id)) {
                allCast.set(actor.id, {
                    id: actor.id,
                    name: actor.name,
                    character: actor.character || '',
                    profile_path: actor.profile_path || null,
                });
            }
        }
    }

    const seasonEpisodes: Record<number, any[]> = {};
    for (const n of seasonNumbers) seasonEpisodes[n] = seasonParts[`season/${n}`]?.episodes || [];

    const rawPosters: TMDBPosterImage[] = [
        ...(images?.posters || []),
        ...seasonNumbers.flatMap((n) => seasonParts[`season/${n}/images`]?.posters || []),
    ];
    const videoList = ownLanguageFirst(videos?.results || []);
    const trailerKey = pickBestTrailerKey(videoList);

    return {
        item,
        cast: Array.from(allCast.values()),
        directors: crewByRoles(credits?.crew, SERIES_CREW_ROLES),
        trailerUrl: trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null,
        videos: videoList,
        status: detail.status || null,
        seasonEpisodes,
        posters: rawPosters
            .filter((poster) => poster.iso_639_1 === own || poster.iso_639_1 === null)
            .map((poster) => ({ ...poster, file_path: originalUrl(poster.file_path) })),
        logo: pickTitleLogo(images?.logos),
        additionalInfo: buildAdditionalInfo('tv', { ...detail, content_ratings }, keywords?.results),
        externalIds: external_ids || {},
        reviews: mergeReviews(reviews?.results, enReviews.results),
        keywords: (keywords?.results || []).map((k: any) => ({ id: k.id, name: k.name })),
    };
}

// --- Recomendaciones ---

function mapSerieDetail(data: any): Serie {
    // Sirve para el detalle y, desde C3, para los resultados de la lista de recomendaciones, que
    // traen `genre_ids` en vez de `genres` (y no traen temporadas, cadenas ni episodios).
    const genreIds: number[] = data.genre_ids ?? data.genres?.map((g: any) => g.id) ?? [];
    return {
        adult: false,
        backdrop_path: backdropUrl(data.backdrop_path, 'w500'),
        genres: data.genres ?? genreIds.map((id) => ({ id, name: getGenreName(id) })),
        genre_ids: genreIds,
        id: data.id,
        origin_country: data.origin_country ?? [],
        original_language: data.original_language,
        original_name: data.original_name,
        overview: data.overview,
        popularity: data.popularity,
        poster_path: posterUrl(data.poster_path),
        first_air_date: data.first_air_date,
        name: data.name,
        vote_average: data.vote_average,
        vote_count: data.vote_count,
        languages: data.languages,
        seasons: data.seasons,
        production_companies: data.production_companies,
        homepage: data.homepage,
        last_episode_to_air: data.last_episode_to_air,
        next_episode_to_air: data.next_episode_to_air,
        providers: [],
    };
}

function mapSerieSimilar(data: any): Serie {
    return {
        adult: false,
        backdrop_path: backdropUrl(data.backdrop_path, 'w500'),
        genres: [],
        genre_ids: data.genre_ids ?? [],
        id: data.id,
        origin_country: data.origin_country ?? [],
        original_language: data.original_language,
        original_name: data.original_name,
        overview: data.overview,
        popularity: data.popularity,
        poster_path: posterUrl(data.poster_path),
        first_air_date: data.first_air_date,
        name: data.name,
        vote_average: data.vote_average,
        vote_count: data.vote_count,
        languages: undefined,
        seasons: undefined,
        production_companies: undefined,
        homepage: undefined,
        last_episode_to_air: undefined,
        next_episode_to_air: undefined,
        providers: [],
    };
}

export async function getSerieRecommendations(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    total_results?: number;
    error?: string;
}> {
    const result = await sharedGetRecommendationsOrSimilar<Serie>('tv', serieId, mapSerieDetail);
    return {
        success: result.success,
        recommendations: result.recommendations,
        error: result.error,
    };
}

export async function getSimilarSeries(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    total_results?: number;
    error?: string;
}> {
    const result = await sharedGetRecommendationsOrSimilar<Serie>('tv', serieId, mapSerieSimilar);
    return {
        success: result.success,
        recommendations: result.recommendations,
        error: result.error,
    };
}

export async function getSerieRecommendationsOrSimilar(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    return sharedGetRecommendationsOrSimilar<Serie>('tv', serieId, mapSerieDetail);
}
