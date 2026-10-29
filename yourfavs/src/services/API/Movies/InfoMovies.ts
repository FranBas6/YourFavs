import { type Movie } from "../../../types/ApiMovie.ts";
import { getCurrentLanguage, getCurrentRegion } from "../../BD/shared/userScope";
import { tmdbFetch, API_KEY, posterUrl, backdropUrl, originalUrl } from '../shared/tmdbClient';
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

// --- Funciones únicas de películas ---

/** «Disponible en español»: traducción es-ES y fecha de estreno en España (ambas cosas). */
function hasSpanishVersion(translations: any[] | undefined, releaseResults: any[] | undefined): boolean {
    const hasTextTranslation = (translations || []).some((t: any) => t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES');
    const hasSpainRelease = (releaseResults || []).some((r: any) => r.iso_3166_1 === 'ES');
    return hasTextTranslation && hasSpainRelease;
}

async function checkMovieSpanishTranslation(movieId: string): Promise<boolean> {
    try {
        const translationsUrl = `${BASE_URL}/movie/${movieId}/translations?api_key=${API_KEY}`;
        const translationsRes = await fetch(translationsUrl);

        if (!translationsRes.ok) return false;

        const translationsData = await translationsRes.json();
        const translations = translationsData.translations || [];
        const hasTextTranslation = translations.some((t: any) =>
            t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES'
        );

        const releasesUrl = `${BASE_URL}/movie/${movieId}/release_dates?api_key=${API_KEY}`;
        const releasesRes = await fetch(releasesUrl);

        let hasSpainRelease = false;
        if (releasesRes.ok) {
            const releasesData = await releasesRes.json();
            const releases = releasesData.results || [];
            hasSpainRelease = releases.some((r: any) => r.iso_3166_1 === 'ES');
        }

        return hasTextTranslation && hasSpainRelease;
    } catch (error) {
        console.error(`Error verificando traducciones para película ${movieId}:`, error);
        return false;
    }
}

export const getMovieById = async ({ id }: { id: string }) => {
    const movie = await tmdbFetch<any>(`/movie/${id}`);
    movie.hasSpanishTranslation = await checkMovieSpanishTranslation(id);

    const providersData = await tmdbFetch<{ results: any }>(`/movie/${id}/watch/providers`, {});
    const esProviders = providersData.results?.[getCurrentRegion()] || providersData.results?.ES || {};
    movie.providers = mapAndDeduplicateProviders(esProviders);
    movie.providersByCountry = buildProvidersByCountry(providersData.results);
    movie.providerLinksByCountry = buildProviderLinksByCountry(providersData.results);

    return movie;
};

interface MovieCastMember {
    id: number;
    name: string;
    character: string;
    profile_path?: string;
}

export const getMovieCast = async (movieId: string): Promise<MovieCastMember[]> => {
    try {
        const data = await tmdbFetch<{ cast: any[] }>(`/movie/${movieId}/credits`);

        if (!data.cast) {
            console.error("No se encontró información del reparto");
            return [];
        }

        return data.cast.map((actor: any) => ({
            id: actor.id,
            name: actor.name,
            character: actor.character || "",
            profile_path: actor.profile_path || null,
        }));
    } catch (error) {
        console.error("Error al obtener el reparto:", error);
        return [];
    }
};

// Interfaz original TMDB
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

export const fetchAllMoviePosters = async (
    movieId: string | number,
    language: string = getCurrentLanguage()
): Promise<PosterImage[]> => {
    const numericId = typeof movieId === 'string' ? parseInt(movieId, 10) : movieId;
    const fullImagePath = (path: string) => originalUrl(path);

    try {
        const movieImagesRes = await fetch(`${BASE_URL}/movie/${numericId}/images?api_key=${API_KEY}`);
        const movieImagesData = await movieImagesRes.json();
        let posters: TMDBPosterImage[] = movieImagesData.posters || [];

        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path),
        }));
    } catch (error) {
        console.error(`Error al obtener los pósters de la película ${numericId}:`, error);
        return [];
    }
};

export interface MovieCollectionInfo {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string | null;
    parts: MovieCollectionPart[];
}

export interface MovieCollectionPart {
    id: number;
    title: string;
    poster_path: string | null;
    release_date: string | null;
    vote_average?: number;
    vote_count?: number;
    overview?: string;
    genre_ids?: number[];
}

export const getMovieCollectionInfo = async (
    collectionId: number
): Promise<MovieCollectionInfo | null> => {
    try {
        const data = await tmdbFetch<any>(`/collection/${collectionId}`);
        return {
            id: data.id,
            name: data.name,
            poster_path: posterUrl(data.poster_path) || null,
            backdrop_path: backdropUrl(data.backdrop_path) || null,
            overview: data.overview || null,
            parts: data.parts?.map((part: any) => ({
                id: part.id,
                title: part.title,
                poster_path: posterUrl(part.poster_path, 'w500') || null,
                release_date: part.release_date,
                vote_average: part.vote_average || 0,
                vote_count: part.vote_count || 0,
                overview: part.overview || '',
                genre_ids: part.genre_ids || [],
            })) || [],
        };
    } catch (error) {
        console.error("Error al obtener la colección:", error);
        return null;
    }
};

export interface CollectionSearchResult {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
}

export interface CollectionSearchResponse {
    results: CollectionSearchResult[];
    page: number;
    totalPages: number;
    totalResults: number;
}

export const searchCollections = async (query: string, page: number = 1): Promise<CollectionSearchResponse> => {
    if (!query || query.trim().length < 2) {
        return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    }
    try {
        const data = await tmdbFetch<{ results?: any[]; page?: number; total_pages?: number; total_results?: number }>(
            `/search/collection`,
            { query: query.trim(), page: String(page) }
        );
        return {
            results: (data.results || []).map(r => ({
                id: r.id,
                name: r.name,
                poster_path: posterUrl(r.poster_path, 'w342') || null,
                backdrop_path: backdropUrl(r.backdrop_path) || null,
            })),
            page: data.page || 1,
            totalPages: data.total_pages || 0,
            totalResults: data.total_results || 0,
        };
    } catch (error) {
        console.error("Error al buscar colecciones:", error);
        return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    }
};

// --- Funciones delegadas a módulos compartidos ---

const MOVIE_CREW_ROLES = [
    "Director", "Producer", "Executive Producer", "Director of Photography",
    "Original Music Composer", "Screenplay", "Writer", "Editor"
];

export const getMovieDirectorsAndRoles = async (movieId: string) =>
    sharedGetDirectorsAndRoles('movie', movieId, MOVIE_CREW_ROLES);

export const getMovieTrailer = async (movieId: string) =>
    sharedGetTrailer('movie', movieId);

export const getMovieVideos = async (movieId: string) =>
    sharedGetVideos('movie', movieId);

export const getMoviesAdditionalInfo = async (movieId: string) =>
    sharedGetAdditionalInfo('movie', movieId);

// --- Ficha en UNA llamada (C1, 2026-10-29) ---

export interface MovieBundle {
    /** `/movie/{id}` crudo + lo que añadía `getMovieById` (proveedores y «en español»). */
    item: any;
    cast: MovieCastMember[];
    directors: { name: string; job: string }[];
    trailerUrl: string | null;
    videos: any[];
    /** Pósters en el idioma del perfil o sin idioma, `file_path` como URL original (sin recortar). */
    posters: PosterImage[];
    logo: string | null;
    additionalInfo: Record<string, any>;
    externalIds: any;
    reviews: { results: any[] };
    keywords: { id: number; name: string }[];
}

/**
 * Todo lo público de la ficha de película con `append_to_response` (TMDB admite hasta 20 sub-recursos
 * y cada uno respeta sus propios parámetros de idioma). Antes eran ~19 llamadas sueltas, varias
 * repetidas (`/movie/{id}` ×3, `/credits` ×2, `/videos` ×2, `/images` ×2, `/keywords` ×2) y tres
 * `fetch` en crudo sin timeout. Cada campo devuelto tiene EXACTAMENTE la forma que daban las
 * funciones sueltas (`getMovieById`, `getMovieCast`, `getMovieDirectorsAndRoles`, `getMovieTrailer`,
 * `getMovieVideos`, `fetchAllMoviePosters`, `getTitleLogo`, `getMoviesAdditionalInfo`, `getReviews`),
 * así que la ficha y `/api/movie/[id]` no cambian. Las reseñas inglesas van aparte: dentro del
 * append heredarían el idioma del perfil. Las imágenes también van aparte y SIN idioma: con
 * `include_image_language` TMDB esconde algunos pósters «sin idioma» (Interstellar: 17 → 10), así
 * que se piden como antes y se filtran aquí. Dos llamadas en paralelo en vez de ~19.
 * El equipo llega en otro orden que con `/credits` suelto (mismas personas): se deja el de TMDB.
 * Devuelve `null` si la película no existe o TMDB falla.
 */
export async function getMovieBundle(movieId: string | number): Promise<MovieBundle | null> {
    const own = getCurrentLanguage().slice(0, 2);
    let data: any;
    let enReviews: { results?: any[] };
    let images: { posters?: TMDBPosterImage[]; logos?: any[] };
    try {
        [data, enReviews, images] = await Promise.all([
            tmdbFetch<any>(`/movie/${movieId}`, {
                append_to_response: 'credits,videos,keywords,release_dates,external_ids,translations,reviews,watch/providers',
                include_video_language: videoLanguages(),
            }),
            own === 'en'
                ? Promise.resolve({ results: [] })
                : tmdbFetch<{ results: any[] }>(`/movie/${movieId}/reviews`, { language: 'en-US' }).catch(() => ({ results: [] })),
            tmdbFetch<any>(`/movie/${movieId}/images`, { language: '' }).catch(() => ({})),
        ]);
    } catch (error) {
        console.error(`❌ Error al obtener la ficha de la película ${movieId}:`, error);
        return null;
    }
    if (!data?.id) return null;

    const { credits, videos, keywords, release_dates, external_ids, translations, reviews, ...detail } = data;
    const providers = data['watch/providers']?.results;
    delete (detail as any)['watch/providers'];

    const item = {
        ...detail,
        hasSpanishTranslation: hasSpanishVersion(translations?.translations, release_dates?.results),
        providers: mapAndDeduplicateProviders(providers?.[getCurrentRegion()] || providers?.ES || {}),
        providersByCountry: buildProvidersByCountry(providers),
        providerLinksByCountry: buildProviderLinksByCountry(providers),
    };
    const videoList = ownLanguageFirst(videos?.results || []);
    const trailerKey = pickBestTrailerKey(videoList);
    const keywordList = (keywords?.keywords || []).map((k: any) => ({ id: k.id, name: k.name }));

    return {
        item,
        cast: (credits?.cast || []).map((actor: any) => ({
            id: actor.id,
            name: actor.name,
            character: actor.character || "",
            profile_path: actor.profile_path || null,
        })),
        directors: crewByRoles(credits?.crew, MOVIE_CREW_ROLES),
        trailerUrl: trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null,
        videos: videoList,
        posters: (images.posters || [])
            .filter((poster) => poster.iso_639_1 === own || poster.iso_639_1 === null)
            .map((poster) => ({ ...poster, file_path: originalUrl(poster.file_path) })),
        logo: pickTitleLogo(images?.logos),
        additionalInfo: buildAdditionalInfo('movie', { ...detail, release_dates }, keywords?.keywords),
        externalIds: external_ids || {},
        reviews: mergeReviews(reviews?.results, enReviews.results),
        keywords: keywordList,
    };
}

// --- Recomendaciones ---

function mapMovieDetail(data: any): Movie {
    return {
        adult: data.adult,
        backdrop_path: backdropUrl(data.backdrop_path, 'w500'),
        // La lista trae `genre_ids`; el detalle, `genres` (antes los similares salían sin géneros).
        genre_ids: data.genre_ids ?? data.genres?.map((g: any) => g.id) ?? [],
        id: data.id,
        original_language: data.original_language,
        overview: data.overview,
        popularity: data.popularity,
        poster_path: posterUrl(data.poster_path),
        title: data.title,
        vote_average: data.vote_average,
        vote_count: data.vote_count,
        original_title: data.original_title,
        release_date: data.release_date,
        video: data.video,
    };
}

export async function getSimilarMovies(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    total_results?: number;
    error?: string;
}> {
    const result = await sharedGetRecommendationsOrSimilar<Movie>('movie', movieId, mapMovieDetail);
    return {
        success: result.success,
        recommendations: result.recommendations,
        error: result.error,
    };
}

/**
 * Recomendaciones de la ficha. `collectionPartIds`: ids de las películas de su saga (la promesa de
 * `getMovieCollectionInfo` que la ficha ya lanza), para no recomendar la propia saga. Antes se pedía
 * otra vez `/movie/{id}` y el detalle de 20 recomendaciones para saberlo (C3).
 */
export async function getMovieRecommendationsOrSimilar(
    movieId: number,
    collectionPartIds?: Promise<number[] | null | undefined> | null,
): Promise<{
    success: boolean;
    recommendations: Movie[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    try {
        const excludeIds = collectionPartIds
            ? collectionPartIds.then((ids) => new Set(ids ?? [])).catch(() => new Set<number>())
            : null;
        return await sharedGetRecommendationsOrSimilar<Movie>('movie', movieId, mapMovieDetail, excludeIds);
    } catch (error) {
        console.error('Error al obtener recomendaciones:', error);
        return {
            success: false,
            recommendations: [],
            type: 'recommendations',
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}
