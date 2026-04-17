import { type Serie } from "../../../types/ApiSerie.ts";
import { tmdbFetch, API_KEY, posterUrl, backdropUrl, originalUrl } from '../shared/tmdbClient';
import {
    getTrailer as sharedGetTrailer,
    getVideos as sharedGetVideos,
    getAdditionalInfo as sharedGetAdditionalInfo,
    getDirectorsAndRoles as sharedGetDirectorsAndRoles,
    mapAndDeduplicateProviders,
    getRecommendationsOrSimilar as sharedGetRecommendationsOrSimilar,
} from '../shared/tmdbInfoService';

const BASE_URL = "https://api.themoviedb.org/3";

// --- Funciones únicas de series ---

async function checkSeriesSpanishAvailability(seriesId: string): Promise<boolean> {
    try {
        const providersUrl = `${BASE_URL}/tv/${seriesId}/watch/providers?api_key=${API_KEY}`;
        const providersRes = await fetch(providersUrl);

        if (!providersRes.ok) return false;

        const providersData = await providersRes.json();
        const esProviders = providersData.results?.ES || {};
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

    const esProviders = providersData.results?.ES || {};
    serie.availableInSpain = await checkSeriesSpanishAvailability(id);
    serie.providers = mapAndDeduplicateProviders(esProviders);

    return serie;
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
    language: string = "es-ES"
): Promise<PosterImage[]> => {
    const numericId = typeof serieId === 'string' ? parseInt(serieId, 10) : serieId;
    const fullImagePath = (path: string) => originalUrl(path);

    try {
        const seriesData = await tmdbFetch<{ seasons: any[] }>(`/tv/${numericId}`, {});
        const seasons = seriesData.seasons || [];

        const seriesImagesRes = await fetch(`${BASE_URL}/tv/${numericId}/images?api_key=${API_KEY}`);
        const seriesImagesData = await seriesImagesRes.json();
        let posters: TMDBPosterImage[] = seriesImagesData.posters || [];

        for (const season of seasons) {
            const seasonNumber = season.season_number;
            const seasonImagesRes = await fetch(`${BASE_URL}/tv/${numericId}/season/${seasonNumber}/images?api_key=${API_KEY}`);
            const seasonImagesData = await seasonImagesRes.json();

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

export const getSeriesDirectorsAndRoles = async (tvId: string) =>
    sharedGetDirectorsAndRoles('tv', tvId, [
        "Director", "Producer", "Executive Producer", "Visual Effects", "Original Music Composer"
    ]);

export const getSeriesTrailer = async (seriesId: string) =>
    sharedGetTrailer('tv', seriesId);

export const getSeriesVideos = async (seriesId: string) =>
    sharedGetVideos('tv', seriesId);

export const getSeriesAdditionalInfo = async (seriesId: string) =>
    sharedGetAdditionalInfo('tv', seriesId);

// --- Recomendaciones ---

function mapSerieDetail(data: any): Serie {
    return {
        adult: false,
        backdrop_path: backdropUrl(data.backdrop_path, 'w500'),
        genres: data.genres ?? [],
        genre_ids: data.genres?.map((g: any) => g.id) ?? [],
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
