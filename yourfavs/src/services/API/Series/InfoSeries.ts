import {type APISerie, type Serie} from "../../../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

const BASE_URL = "https://api.themoviedb.org/3";

// Obtener serie por ID y sus plataformas de visualización
export const getSeriesById = async ({id}: { id: string }) => {
    const movieRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
    const providersRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${API_KEY}`);

    const serie = await movieRes.json() as Serie;
    const providers = await providersRes.json();

    // Añadir la información de las plataformas de visualización a la serie
    serie.providers = providers.results?.ES?.flatrate?.map((provider: any) => ({
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        logo_path: provider.logo_path,
    })) || [];

    return serie;
};

// Interfaz para el tipo de datos del reparto
interface CastMember {
    id: number;
    name: string;
    character: string;
    profile_path?: string;
}

// Función para obtener el reparto completo de todas las temporadas
export const getSeriesCast = async (tvId: string): Promise<CastMember[]> => {
    const seriesUrl = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=es-ES`;
    const seriesResponse = await fetch(seriesUrl);
    const seriesData = await seriesResponse.json();

    const totalSeasons = seriesData.number_of_seasons;
    const allCast = new Map<number, CastMember>();

    for (let season = 1; season <= totalSeasons; season++) {
        const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${season}/credits?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();

        data.cast?.forEach((actor: any) => {
            if (!allCast.has(actor.id)) {
                allCast.set(actor.id, {
                    id: actor.id,
                    name: actor.name,
                    character: actor.character || '',
                    profile_path: actor.profile_path || null, // ✅ recogemos la imagen si existe
                });
            }
        });
    }

    return Array.from(allCast.values());
};

// Función para obtener los directores y sus roles en una serie
export const getSeriesDirectorsAndRoles = async (tvId: string): Promise<{ name: string, job: string }[]> => {
    const url = `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${API_KEY}&language=es-ES`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        const relevantRoles = ["Producer", "Executive Producer", "Visual Effects", "Original Music Composer"];

        return data.crew
            .filter((member: any) => relevantRoles.includes(member.job))
            .map((director: any) => ({name: director.name, job: director.job}))
    } catch (error) {
        console.error("Hubo un error al obtener los datos de los directores y roles:", error);
        return [];
    }
};

// Funcion para obtener el trailer de una serie
export const getSeriesTrailer = async (seriesId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/tv/${seriesId}/videos?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const trailer = data.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');

        // Si se encuentra el trailer, devolver el enlace al video en YouTube
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (error) {
        console.error("Hubo un error al obtener el trailer:", error);
        return null;
    }
};

// Funcion para obtener el estado de una serie
export const getSeriesStatus = async (seriesId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const status = data.status; // Obtiene el estado de la serie (ej. 'Returning Series', 'Ended', 'Canceled')

        // Devolver el estado de la serie
        return status || null;
    } catch (error) {
        console.error("Hubo un error al obtener el estado de la serie:", error);
        return null;
    }
};

// Modifica tu función getEpisodesBySeasonNumber para mostrar más detalles
export async function getEpisodesBySeasonNumber(serieId: number | string, seasonNumber: number): Promise<any[]> {
    try {
        const url = `https://api.themoviedb.org/3/tv/${serieId}/season/${seasonNumber}?api_key=${API_KEY}&language=es-ES`;

        console.log(`Intentando acceder a: ${url.replace(API_KEY, "API_KEY_HIDDEN")}`);

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error de API: ${response.status} - ${errorText}`);
            throw new Error(`Error obteniendo episodios: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Datos obtenidos para temporada ${seasonNumber}, episodios: ${data.episodes?.length || 0}`);

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

// Interfaz para nuestra respuesta procesada
export interface PosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string; // Esta ya incluye la URL base
    vote_average: number;
    vote_count: number;
    width: number;
}

// Función para obtener posters de una serie y sus temporadas
export const fetchAllSeriesPosters = async (
    serieId: string | number,
    language: string = "es-ES"
): Promise<PosterImage[]> => {
    const numericId = typeof serieId === 'string' ? parseInt(serieId, 10) : serieId;
    const baseUrl = `https://api.themoviedb.org/3`;
    const fullImagePath = (path: string) => `https://image.tmdb.org/t/p/original${path}`;

    try {
        // Obtener datos de la serie (para conocer las temporadas)
        const seriesRes = await fetch(`${baseUrl}/tv/${numericId}?api_key=${API_KEY}`);
        const seriesData = await seriesRes.json();
        const seasons = seriesData.seasons || [];

        // Obtener pósters generales de la serie
        const seriesImagesRes = await fetch(`${baseUrl}/tv/${numericId}/images?api_key=${API_KEY}`);
        const seriesImagesData = await seriesImagesRes.json();
        let posters: TMDBPosterImage[] = seriesImagesData.posters || [];

        // Obtener pósters de cada temporada (incluyendo especiales - temporada 0)
        for (const season of seasons) {
            const seasonNumber = season.season_number;
            const seasonImagesRes = await fetch(`${baseUrl}/tv/${numericId}/season/${seasonNumber}/images?api_key=${API_KEY}`);
            const seasonImagesData = await seasonImagesRes.json();

            if (Array.isArray(seasonImagesData.posters)) {
                posters = posters.concat(seasonImagesData.posters);
            }
        }

        // Filtrar por idioma si se ha indicado uno específico
        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        // Formatear con ruta completa
        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path)
        }));

    } catch (error) {
        console.error(`Error al obtener los pósters de la serie ${numericId}:`, error);
        return [];
    }
};

type TMDBResponse = {
    results: Serie[];
    total_results: number;
    total_pages: number;
    page: number;
};

// Método para obtener series recomendadas desde TMDB
export async function getSerieRecommendations(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    total_results?: number;
    error?: string;
}> {
    try {
        const serieRes = await fetch(`https://api.themoviedb.org/3/tv/${serieId}?api_key=${API_KEY}&language=es-ES`);
        if (!serieRes.ok) throw new Error(`Error ${serieRes.status}: ${serieRes.statusText}`);
        const serieData = await serieRes.json();

        const recRes = await fetch(`https://api.themoviedb.org/3/tv/${serieId}/recommendations?api_key=${API_KEY}&language=es-ES&page=1`);
        if (!recRes.ok) throw new Error(`Error ${recRes.status}: ${recRes.statusText}`);
        const recData: TMDBResponse = await recRes.json();

        const filteredRaw = recData.results.filter((serie: any) => serie.poster_path);

        const detailedPromises = filteredRaw.slice(0, 20).map(async (serie: any) => {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${serie.id}?api_key=${API_KEY}&language=es-ES`);
            if (!res.ok) return null;
            const data = await res.json();

            return {
                adult: false,
                backdrop_path: data.backdrop_path ? `https://image.tmdb.org/t/p/w500${data.backdrop_path}` : "",
                genres: data.genres ?? [],
                genre_ids: data.genres?.map((g: any) => g.id) ?? [],
                id: data.id,
                origin_country: data.origin_country ?? [],
                original_language: data.original_language,
                original_name: data.original_name,
                overview: data.overview,
                popularity: data.popularity,
                poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : "",
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
                providers: [] // puedes añadirlo luego con lógica extra si lo necesitas
            } as Serie;
        });

        const detailedSeries = (await Promise.all(detailedPromises)).filter(Boolean).slice(0, 12) as Serie[];

        return {
            success: true,
            recommendations: detailedSeries,
            total_results: recData.total_results
        };

    } catch (error) {
        console.error('Error al obtener recomendaciones de series:', error);
        return {
            success: false,
            recommendations: [],
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}


// Método alternativo para obtener series similares si no hay recomendaciones
export async function getSimilarSeries(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    total_results?: number;
    error?: string;
}> {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/tv/${serieId}/similar?api_key=${API_KEY}&language=es-ES&page=1`
        );
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);

        const data: TMDBResponse = await response.json();

        const similarSeries = data.results
            .filter((serie: any) => serie.poster_path)
            .slice(0, 12)
            .map((serie: any): Serie => ({
                adult: false,
                backdrop_path: serie.backdrop_path ? `https://image.tmdb.org/t/p/w500${serie.backdrop_path}` : "",
                genres: [], // Se omite en este nivel, pero puedes completarlo si haces fetch detallado
                genre_ids: serie.genre_ids ?? [],
                id: serie.id,
                origin_country: serie.origin_country ?? [],
                original_language: serie.original_language,
                original_name: serie.original_name,
                overview: serie.overview,
                popularity: serie.popularity,
                poster_path: `https://image.tmdb.org/t/p/w500${serie.poster_path}`,
                first_air_date: serie.first_air_date,
                name: serie.name,
                vote_average: serie.vote_average,
                vote_count: serie.vote_count,
                languages: undefined,
                seasons: undefined,
                production_companies: undefined,
                homepage: undefined,
                last_episode_to_air: undefined,
                next_episode_to_air: undefined,
                providers: []
            }));

        return {
            success: true,
            recommendations: similarSeries,
            total_results: data.total_results
        };

    } catch (error) {
        console.error('Error al obtener series similares:', error);
        return {
            success: false,
            recommendations: [],
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}


// Método combinado: intenta recomendaciones y luego similares si es necesario
export async function getSerieRecommendationsOrSimilar(serieId: number): Promise<{
    success: boolean;
    recommendations: Serie[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    let result = await getSerieRecommendations(serieId);

    if (!result.success || result.recommendations.length < 6) {
        const similarResult = await getSimilarSeries(serieId);

        if (similarResult.success) {
            if (result.success && result.recommendations.length > 0) {
                const combined = [...result.recommendations, ...similarResult.recommendations];
                const unique = combined.filter((serie: Serie, index: number, self: Serie[]) =>
                    index === self.findIndex((s: Serie) => s.id === serie.id)
                );

                return {
                    success: true,
                    recommendations: unique.slice(0, 12),
                    type: 'combined'
                };
            } else {
                return {
                    success: true,
                    recommendations: similarResult.recommendations,
                    type: 'similar'
                };
            }
        }
    }

    return {
        ...result,
        type: 'recommendations'
    };
}