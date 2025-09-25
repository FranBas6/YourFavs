import {type APIMovie, type Movie} from "../../../types/ApiMovie.ts";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

const BASE_URL = "https://api.themoviedb.org/3";

export const fetchMovieDetails = async (id: string | number) => {
    try {
        const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&language=es-ES`);

        if (!res.ok) {
            const errorBody = await res.text();
            console.error(`❌ Error al obtener película ID ${id}:`, res.status, errorBody);
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error(`❌ Error inesperado al obtener detalles de película ID ${id}:`, error);
        return null;
    }
};

// Obtener últimas películas lanzadas
export const getLatestMovies = async ({page}: { page?: string }): Promise<Movie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const movies: Movie[] = Array.isArray(data.results) ? data.results : [];

        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(today.getDate() + 7);

        const filteredMovies = movies.filter((movie) => {
            if (!movie.release_date) return false;
            const releaseDate = new Date(movie.release_date);
            return releaseDate <= oneWeekLater; // Películas ya estrenadas o que se estrenan en 7 días
        });

        return filteredMovies.sort((a, b) => {
            // Primero por valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Luego por popularidad
            if (b.popularity !== a.popularity) {
                return b.popularity - a.popularity;
            }
            // Luego fecha de estreno
            const dateA = new Date(a.release_date || "");
            const dateB = new Date(b.release_date || "");
            return dateB.getTime() - dateA.getTime();
        });

    } catch (error) {
        console.error("Hubo un error al obtener las películas:", error);
        return [];
    }
};

// Películas más populares
export const getMostPopularMovies = async ({page}: { page?: string }): Promise<Movie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const movies: Movie[] = Array.isArray(data.results) ? data.results : [];

        // Ordenar las películas de más popular a menos popular
        return movies.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las películas populares:", error);
        return [];
    }
};

// Películas mejor valoradas
export const getTopRatedMovies = async ({page}: { page?: string }): Promise<Movie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const movies: Movie[] = Array.isArray(data.results) ? data.results : [];

        const filteredMovies = movies.filter((movie) => {
            // Solo películas con un mínimo de votos decentes
            return (movie.vote_count ?? 0) >= 50;
        });

        return filteredMovies.sort((a, b) => {
            // Primero por mejor valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Si empate en nota, ordenar por popularidad
            return b.popularity - a.popularity;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las películas mejor valoradas:", error);
        return [];
    }
};

// Obtener películas en cartelera
export const getNowPlayingMoviesInSpain = async ({ page }: { page?: string }): Promise<Movie[]> => {
    const pageNumber = page || "1";
    const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=es-ES&region=ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const movies: Movie[] = Array.isArray(data.results) ? data.results : [];

        // Puedes mantener el orden personalizado si lo deseas
        return movies.sort((a, b) => {
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
            const dateA = new Date(a.release_date || "");
            const dateB = new Date(b.release_date || "");
            return dateB.getTime() - dateA.getTime();
        });
    } catch (error) {
        console.error("Hubo un error al obtener las películas en cartelera en España:", error);
        return [];
    }
};

// -- Obtener películas por género--

// Obtener películas por categoría
const genreMap: Record<string, number | "upcoming"> = {
    accion: 28,
    aventura: 12,
    animacion: 16,
    comedia: 35,
    crimen: 80,
    documental: 99,
    drama: 18,
    familia: 10751,
    fantasia: 14,
    historico: 36,
    terror: 27,
    musical: 10402,
    misterio: 9648,
    romance: 10749,
    ciencia_ficcion: 878,
    pelicula_tv: 10770,
    suspense: 53,
    belica: 10752,
    western: 37,
    proximamente: "upcoming",
};

// --- Funciones auxiliares ---

const buildDiscoverUrl = (genreId: number, page: string) =>
    `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=${page}`;

const buildUpcomingUrl = (page: string) =>
    `https://api.themoviedb.org/3/movie/upcoming?api_key=${API_KEY}&language=es-ES&sort_by=popularity.desc&page=${page}`;

const isUpcomingMovie = (releaseDate: string): boolean => {
    const today = new Date();
    const movieDate = new Date(releaseDate);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    return movieDate >= oneMonthAgo;
};

const sortByExpectation = (a: Movie, b: Movie) => {
    if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
    }
    return b.vote_average - a.vote_average;
};

// --- Función principal ---

export const getMoviesByCategory = async (category: string, page: string = "1"): Promise<Movie[]> => {
    const normalizedCategory = category.trim().toLowerCase();
    const genreOrUpcoming = genreMap[normalizedCategory];

    if (!genreOrUpcoming) {
        throw new Error(`Categoría no válida: ${category}`);
    }

    const url = genreOrUpcoming === "upcoming"
        ? buildUpcomingUrl(page)
        : buildDiscoverUrl(genreOrUpcoming, page);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();
        const results: Movie[] = Array.isArray(data.results) ? data.results : [];

        let movies = results;

        if (genreOrUpcoming === "upcoming") {
            // Filtrar para mostrar solo las que se estrenan hoy o en el futuro, o máximo 1 mes pasado
            movies = movies.filter(movie => movie.release_date && isUpcomingMovie(movie.release_date));
        }

        return movies.sort(sortByExpectation);

    } catch (error) {
        console.error("Hubo un error al obtener las películas:", error);
        return [];
    }
};

export const getMoviesByTitle = async ({title, page}: { title: string, page?: string }): Promise<Movie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&query=${title}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const movies: Movie[] = Array.isArray(data.results) ? data.results : [];

        // Devolver el array de películas ordenadas solo por popularidad
        return movies.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las películas:", error);
        return [];
    }
};

// -- Obtener películas por proveedor de streaming --

// Función para obtener las películas más populares (orden fijo por popularidad descendente)
const fetchMoviesByProvider = async (
    providerId: number,
    page: string = "1"
): Promise<Movie[]> => {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=popularity.desc`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
        console.error(`Hubo un error al obtener películas del proveedor ${providerId}:`, error);
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

// Funciones que siempre devuelven las películas más populares
export const getNetflixMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.NETFLIX, page);

export const getAmazonPrimeMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.AMAZON, page);

export const getDisneyPlusMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.DISNEY, page);

export const getHBOMaxMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.HBO, page);

export const getAppleTVMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.APPLE, page);

export const getMovistarPlusMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.MOVISTAR, page);

export const getFilminMovies = async (page?: string) =>
    fetchMoviesByProvider(PROVIDERS.FILMIN, page);
