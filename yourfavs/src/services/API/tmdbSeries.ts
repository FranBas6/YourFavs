import {type APISerie, type Serie} from "../../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

const BASE_URL = "https://api.themoviedb.org/3";

export const fetchSerieDetails = async (id: string | number) => {
    try {
        const res = await fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}&language=es-ES`);

        if (!res.ok) {
            const errorBody = await res.text();
            console.error(`❌ Error al obtener serie ID ${id}:`, res.status, errorBody);
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error(`❌ Error inesperado al obtener detalles de serie ID ${id}:`, error);
        return null;
    }
};

// Obtener series en emisión
export const getLatestSeries = async ({ page }: { page?: string }): Promise<Serie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(today.getDate() + 7);

        const filteredSeries = series.filter((serie) => {
            const firstAirDate = serie.first_air_date ? new Date(serie.first_air_date) : null;
            const nextEpisodeDate = serie.next_episode_to_air?.air_date ? new Date(serie.next_episode_to_air.air_date) : null;

            if (firstAirDate && firstAirDate > oneWeekLater) {
                // No mostrar si aún no ha empezado y falta más de una semana
                return false;
            }

            if (nextEpisodeDate && nextEpisodeDate > oneWeekLater) {
                // Si el próximo episodio es dentro de más de una semana, tampoco
                return false;
            }

            // Si ha empezado ya o empieza muy pronto, sí la mostramos
            return true;
        });

        return filteredSeries.sort((a, b) => {
            // Primero por valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Luego por popularidad
            if (b.popularity !== a.popularity) {
                return b.popularity - a.popularity;
            }
            // Luego por fecha de primer episodio
            const dateA = new Date(a.first_air_date || "");
            const dateB = new Date(b.first_air_date || "");
            return dateB.getTime() - dateA.getTime();
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

// Series más populares
export const getMostPopularSeries = async ({page}: { page?: string }): Promise<Serie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Ordenar las series de más popular a menos popular
        return series.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las series populares:", error);
        return [];
    }
};

// Series mejor valoradas
export const getTopRatedSeries = async ({ page }: { page?: string }): Promise<Serie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/top_rated?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        const filteredSeries = series.filter((serie) => {
            // Nos aseguramos que tengan un número de votos decente
            return (serie.vote_count ?? 0) >= 50;
        });

        return filteredSeries.sort((a, b) => {
            // Primero por mejor valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Si empate en nota, ordenar por popularidad
            return b.popularity - a.popularity;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series mejor valoradas:", error);
        return [];
    }
};

// Obtener serie por ID y sus plataformas de visualización
export const getSeriesById = async ({id}: { id: string }) => {
    const movieRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
    const providersRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${API_KEY}`);

    const movie = await movieRes.json() as Serie;
    const providers = await providersRes.json();

    // Añadir la información de las plataformas de visualización a la serie
    movie.providers = providers.results?.ES?.flatrate?.map((provider: any) => ({
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        logo_path: provider.logo_path,
    })) || [];

    return movie;
};

// Interfaz para el tipo de datos del reparto
interface CastMember {
    name: string;
    character: string;
    id: number;
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
                    name: actor.name,
                    character: actor.character,
                    id: actor.id
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

// Funcion para buscar series por título
export const getSeriesByTitle = async ({title, page}: { title: string, page?: string }): Promise<Serie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${title}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Devolver el array de series ordenadas solo por popularidad
        return series.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

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

// --- Configuración ---
const genreMap: Record<string, number | "on_the_air" | "horror"> = {
    accion: 10759,
    aventura: 10759,
    animacion: 16,
    comedia: 35,
    crimen: 80,
    documental: 99,
    drama: 18,
    familia: 10751,
    infantil: 10762,
    misterio: 9648,
    noticias: 10763,
    reality: 10764,
    ciencia_ficcion: 10765,
    fantasia: 10765,
    romance: 10749,
    telenovela: 10766,
    talkshow: 10767,
    terror: "horror", // Especial, ya que TMDB no tiene un género "terror" específico para TV
    guerra_politica: 10768,
    western: 37,
    proximamente: "on_the_air",
};

// --- Funciones auxiliares ---
const buildDiscoverTvUrl = (genreId: number, page: string) =>
    `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=${page}`;

const buildOnTheAirUrl = (page: string) =>
    `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${page}`;

const buildHorrorSearchUrl = (page: string) =>
    `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-ES&query=horror&page=${page}`;

const sortByExpectation = (a: Serie, b: Serie) => {
    if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
    }
    return b.vote_average - a.vote_average;
};

// --- Función principal ---
export const getSeriesByCategory = async (category: string, page: string = "1"): Promise<Serie[]> => {
    const normalizedCategory = category.trim().toLowerCase();
    const genreOrType = genreMap[normalizedCategory];

    if (!genreOrType) {
        throw new Error(`Categoría no válida: ${category}`);
    }

    let url: string;

    if (genreOrType === "on_the_air") {
        url = buildOnTheAirUrl(page);
    } else if (genreOrType === "horror") {
        url = buildHorrorSearchUrl(page);
    } else {
        url = buildDiscoverTvUrl(genreOrType, page);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Para "proximamente" (on_the_air), podrías filtrar por fecha si quieres, pero normalmente TMDB ya da las que están en emisión
        return series.sort(sortByExpectation);

    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

// --- Función para obtener series por plataforma ---

// Tipos para mejor organización
type SortOption = 'popularity' | 'vote_average' | 'first_air_date' | 'name';
type SortOrder = 'asc' | 'desc';

// Función mejorada para obtener y ordenar series
const fetchSeriesByProvider = async (
    providerId: number,
    page: string = "1",
    sortBy: SortOption = 'popularity',
    sortOrder: SortOrder = 'desc'
): Promise<Serie[]> => {
    // Mapeo para parámetros de ordenación de TMDb
    const sortMapping = {
        popularity: 'popularity',
        vote_average: 'vote_average',
        first_air_date: 'first_air_date',
        name: 'original_name'
    };

    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=${sortMapping[sortBy]}.${sortOrder}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
        console.error(`Hubo un error al obtener series del proveedor ${providerId}:`, error);
        return [];
    }
};

// Definición de proveedores para mejor mantenimiento
const PROVIDERS = {
    NETFLIX: 8,
    AMAZON: 119,
    DISNEY: 337,
    HBO: 1899,
    APPLE: 350,
    MOVISTAR: 2241,
    FILMIN: 63
};

// Funciones mejoradas que permiten ordenación
export const getNetflixSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.NETFLIX, page, sortBy, sortOrder);

export const getAmazonPrimeSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.AMAZON, page, sortBy, sortOrder);

export const getDisneyPlusSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.DISNEY, page, sortBy, sortOrder);

export const getHBOMaxSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.HBO, page, sortBy, sortOrder);

export const getAppleTVSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.APPLE, page, sortBy, sortOrder);

export const getMovistarPlusSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.MOVISTAR, page, sortBy, sortOrder);

export const getFilminSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.FILMIN, page, sortBy, sortOrder);