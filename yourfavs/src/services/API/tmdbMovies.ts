import {type APIMovie, type Movie} from "../../types/ApiMovie.ts";

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

// Obtener películas en cartelera
export const getLatestMovies = async ({ page }: { page?: string }): Promise<Movie[]> => {
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
export const getTopRatedMovies = async ({ page }: { page?: string }): Promise<Movie[]> => {
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

// Obtener película por ID
export const getMovieById = async ({id}: { id: string }) => {
    // Obtener los detalles de la película
    const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${API_KEY}&language=es-ES`);
    const movie = await movieRes.json();

    // Obtener las plataformas de visualización de la película
    const providersRes = await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${API_KEY}&language=es-ES`);
    const providers = await providersRes.json();

    // Añadir las plataformas al objeto de la película
    const availablePlatforms = providers?.results?.ES?.flatrate || [];  // Ajustar el país según sea necesario (ES = España)

    return {
        ...movie,
        providers: availablePlatforms
    };
};

// Interfaz para el tipo de datos del reparto de películas
interface MovieCastMember {
    name: string;
    character: string;
    id: number;
}

// Función modificada para obtener el reparto de películas con información del personaje
export const getMovieCast = async (movieId: string): Promise<MovieCastMember[]> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        // Verificar si data.cast existe
        if (!data.cast) {
            console.error("No se encontró información del reparto");
            return [];
        }

        return data.cast.map((actor: any) => ({
            name: actor.name,
            character: actor.character || "",
            id: actor.id
        }));
    } catch (error) {
        console.error("Error al obtener el reparto:", error);
        return [];
    }
};

// Función para obtener directores y roles específicos de una película
export const getMovieDirectorsAndRoles = async (movieId: string): Promise<{ name: string, job: string }[]> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        // Verificar si data.crew existe
        if (!data.crew) {
            console.error("No se encontró información del equipo");
            return [];
        }

        const relevantRoles = ["Producer", "Executive Producer", "Visual Effects", "Original Music Composer"];

        return data.crew
            .filter((member: any) => relevantRoles.includes(member.job))
            .map((person: any) => ({name: person.name, job: person.job}))
    } catch (error) {
        console.error("Hubo un error al obtener los datos de los directores y roles de la película:", error);
        return [];
    }
};

// Funcion para obtener el trailer de una película
export const getMovieTrailer = async (movieId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const trailer = data.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');

        // Sí se encuentra el trailer, devolver el enlace al video en YouTube
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (error) {
        console.error("Hubo un error al obtener el trailer:", error);
        return null;
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

// Interfaz para nuestra app
export interface PosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

// Función para obtener todos los pósters de una película
export const fetchAllMoviePosters = async (
    movieId: string | number,
    language: string = "es-ES"
): Promise<PosterImage[]> => {
    const numericId = typeof movieId === 'string' ? parseInt(movieId, 10) : movieId;
    const baseUrl = `https://api.themoviedb.org/3`;
    const fullImagePath = (path: string) => `https://image.tmdb.org/t/p/original${path}`;

    try {
        // Obtener pósters de la película
        const movieImagesRes = await fetch(`${baseUrl}/movie/${numericId}/images?api_key=${API_KEY}`);
        const movieImagesData = await movieImagesRes.json();
        let posters: TMDBPosterImage[] = movieImagesData.posters || [];

        // Filtrar por idioma si se especifica
        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        // Devolver los pósters con URL completa
        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path)
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
}

// Función para obtener información de una colección de películas
export const getMovieCollectionInfo = async (
    collectionId: number
): Promise<MovieCollectionInfo | null> => {
    const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        return {
            id: data.id,
            name: data.name,
            poster_path: data.poster_path
                ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
                : null,
            backdrop_path: data.backdrop_path
                ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
                : null,
            overview: data.overview || null,
            parts: data.parts?.map((part: any) => ({
                id: part.id,
                title: part.title,
                poster_path: part.poster_path ? `https://image.tmdb.org/t/p/w200${part.poster_path}` : null,
                release_date: part.release_date
            })) || []
        };
    } catch (error) {
        console.error("Hubo un error al obtener la colección:", error);
        return null;
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

// Tipos para mejor organización
type SortOption = 'popularity' | 'vote_average' | 'release_date' | 'title';
type SortOrder = 'asc' | 'desc';

// Función mejorada para obtener y ordenar películas
const fetchMoviesByProvider = async (
    providerId: number,
    page: string = "1",
    sortBy: SortOption = 'popularity',
    sortOrder: SortOrder = 'desc'
): Promise<Movie[]> => {
    // Mapeo para parámetros de ordenación de TMDb
    const sortMapping = {
        popularity: 'popularity',
        vote_average: 'vote_average',
        release_date: 'release_date',
        title: 'original_title'
    };

    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=${sortMapping[sortBy]}.${sortOrder}`;

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

// Funciones mejoradas que permiten ordenación
export const getNetflixMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.NETFLIX, page, sortBy, sortOrder);

export const getAmazonPrimeMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.AMAZON, page, sortBy, sortOrder);

export const getDisneyPlusMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.DISNEY, page, sortBy, sortOrder);

export const getHBOMaxMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.HBO, page, sortBy, sortOrder);

export const getAppleTVMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.APPLE, page, sortBy, sortOrder);

export const getMovistarPlusMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.MOVISTAR, page, sortBy, sortOrder);

export const getFilminMovies = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchMoviesByProvider(PROVIDERS.FILMIN, page, sortBy, sortOrder);