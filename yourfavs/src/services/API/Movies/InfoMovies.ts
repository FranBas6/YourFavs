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
} from '../shared/tmdbInfoService';

const BASE_URL = "https://api.themoviedb.org/3";

// --- Funciones únicas de películas ---

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

export const getMovieDirectorsAndRoles = async (movieId: string) =>
    sharedGetDirectorsAndRoles('movie', movieId, [
        "Director", "Producer", "Executive Producer", "Director of Photography",
        "Original Music Composer", "Screenplay", "Writer", "Editor"
    ]);

export const getMovieTrailer = async (movieId: string) =>
    sharedGetTrailer('movie', movieId);

export const getMovieVideos = async (movieId: string) =>
    sharedGetVideos('movie', movieId);

export const getMoviesAdditionalInfo = async (movieId: string) =>
    sharedGetAdditionalInfo('movie', movieId);

// --- Recomendaciones ---

function mapMovieDetail(data: any): Movie {
    return {
        adult: data.adult,
        backdrop_path: backdropUrl(data.backdrop_path, 'w500'),
        genre_ids: data.genres?.map((g: any) => g.id) || [],
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

export async function getMovieRecommendations(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    total_results?: number;
    error?: string;
}> {
    try {
        const movieData = await tmdbFetch<any>(`/movie/${movieId}`);
        const collectionId = movieData.belongs_to_collection?.id;

        const result = await sharedGetRecommendationsOrSimilar<Movie>(
            'movie',
            movieId,
            mapMovieDetail,
            collectionId ? (data: any) => data.belongs_to_collection?.id === collectionId : undefined
        );

        return {
            success: result.success,
            recommendations: result.recommendations,
            error: result.error,
        };
    } catch (error) {
        console.error('Error al obtener recomendaciones:', error);
        return {
            success: false,
            recommendations: [],
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
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

export async function getMovieRecommendationsOrSimilar(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    try {
        const movieData = await tmdbFetch<any>(`/movie/${movieId}`);
        const collectionId = movieData.belongs_to_collection?.id;

        return sharedGetRecommendationsOrSimilar<Movie>(
            'movie',
            movieId,
            mapMovieDetail,
            collectionId ? (data: any) => data.belongs_to_collection?.id === collectionId : undefined
        );
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
