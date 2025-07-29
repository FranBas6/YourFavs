import {type APISerie, type Serie} from "../../../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido

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
export const getLatestSeries = async ({page}: { page?: string }): Promise<Serie[]> => {
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
export const getTopRatedSeries = async ({page}: { page?: string }): Promise<Serie[]> => {
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

// Función para obtener las series más populares (orden fijo por popularidad descendente)
const fetchSeriesByProvider = async (
    providerId: number,
    page: string = "1"
): Promise<Serie[]> => {
    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=popularity.desc`;

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

// Funciones que siempre devuelven las series más populares
export const getNetflixSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.NETFLIX, page);

export const getAmazonPrimeSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.AMAZON, page);

export const getDisneyPlusSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.DISNEY, page);

export const getHBOMaxSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.HBO, page);

export const getAppleTVSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.APPLE, page);

export const getMovistarPlusSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.MOVISTAR, page);

export const getFilminSeries = async (page?: string) =>
    fetchSeriesByProvider(PROVIDERS.FILMIN, page);
