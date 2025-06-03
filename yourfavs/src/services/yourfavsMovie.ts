import {type APIMovie, type Movie} from "../types/ApiMovie.ts";

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, deleteDoc, doc } from "firebase/firestore";

interface MovieFavs {
    id: string,
    title: string;
    release_date: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    added_at: string;
    genres: string[];
}

interface MoviesPendientes {
    id: string,
    title: string;
    release_date: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    added_at: string;
    genres: string[];
}

interface MoviesVistas {
    id: string,
    title: string;
    release_date: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    added_at: string;
    genres: string[];
}

interface MoviesVerPronto {
    id: string,
    title: string;
    release_date: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    added_at: string;
    genres: string[];
}

// Interfaz para las películas recomendadas
interface RecommendedMovie {
    id: string;
    title: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    release_date: string;
    popularity?: number;
    score?: number; // Puntuación personalizada para ordenar recomendaciones
    genres?: Array<{
        id: number,
        name: string
    }>;
}

// Configuración de Firebase
const firebaseConfig = {
    apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
    measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
// Inicializar Firestore
const db = getFirestore(app);

// Obtener películas favoritas ordenadas por fecha de añadido (más reciente primero)
export const getMovieFav = async (): Promise<MovieFavs[]> => {
    try {
        console.log("Intentando obtener películas favoritas...");

        // Referencia a la colección de películas favoritas con ordenamiento
        const movieFavsRef = collection(db, "MovieFavs");
        const q = query(movieFavsRef, orderBy("added_at", "desc"));

        // Obtener documentos ordenados
        const querySnapshot = await getDocs(q);

        console.log("Resultado de la consulta ordenado:", querySnapshot);

        if (querySnapshot.empty) {
            console.warn("No se encontraron películas favoritas.");
            return [];
        }

        // Convertir los documentos a un array de datos con el tipo MovieFavs
        const result: MovieFavs[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieFavs;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas favoritas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas pendientes ordenadas por fecha de añadido (más reciente primero)
export const getMoviesPendientes = async (): Promise<MoviesPendientes[]> => {
    try {
        console.log("Intentando obtener películas pendientes...");

        // Referencia a la colección de películas pendientes con ordenamiento
        const moviesPendientesRef = collection(db, "MoviesPendientes");
        const q = query(moviesPendientesRef, orderBy("added_at", "desc"));

        // Obtener documentos ordenados
        const querySnapshot = await getDocs(q);

        console.log("Resultado de la consulta ordenado:", querySnapshot);

        if (querySnapshot.empty) {
            console.warn("No se encontraron películas pendientes.");
            return [];
        }

        // Convertir los documentos a un array de datos con el tipo MoviesPendientes
        const result: MoviesPendientes[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MoviesPendientes;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas pendientes:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas vistas ordenadas por fecha de añadido (más reciente primero)
export const getMoviesVistas = async (): Promise<MoviesVistas[]> => {
    try {
        console.log("Intentando obtener películas vistas...");

        // Referencia a la colección de películas vistas con ordenamiento
        const moviesVistasRef = collection(db, "MoviesVistas");
        const q = query(moviesVistasRef, orderBy("added_at", "desc"));

        // Obtener documentos ordenados
        const querySnapshot = await getDocs(q);

        console.log("Resultado de la consulta ordenado:", querySnapshot);

        if (querySnapshot.empty) {
            console.warn("No se encontraron películas vistas.");
            return [];
        }

        // Convertir los documentos a un array de datos con el tipo MoviesVistas
        const result: MoviesVistas[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MoviesVistas;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas vistas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas para ver pronto ordenadas por fecha de añadido (más reciente primero)
export const getMoviesVerPronto = async (): Promise<MoviesVerPronto[]> => {
    try {
        console.log("Intentando obtener películas para ver pronto...");

        // Referencia a la colección de películas pendientes con ordenamiento
        const moviesVerProntoRef = collection(db, "MoviesVerPronto");
        const q = query(moviesVerProntoRef, orderBy("added_at", "desc"));

        // Obtener documentos ordenados
        const querySnapshot = await getDocs(q);

        console.log("Resultado de la consulta ordenado:", querySnapshot);

        if (querySnapshot.empty) {
            console.warn("No se encontraron películas para ver pronto.");
            return [];
        }

        // Convertir los documentos a un array de datos con el tipo MoviesPendientes
        const result: MoviesVerPronto[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MoviesVerPronto;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas para ver pronto:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

export async function clearAllMoviesVerPronto() {
    try {
        const peliculasVerProntoRef = collection(db, 'MoviesVerPronto');
        const querySnapshot = await getDocs(peliculasVerProntoRef);

        const deletePromises: Promise<void>[] = [];
        querySnapshot.forEach((docSnapshot) => {
            deletePromises.push(deleteDoc(doc(db, 'MoviesVerPronto', docSnapshot.id)));
        });

        await Promise.all(deletePromises);

        return {
            success: true,
            deletedCount: deletePromises.length,
            message: `Se borraron ${deletePromises.length} películas exitosamente`
        };

    } catch (error) {
        console.error('Error al borrar todas las películas:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Error al borrar las películas'
        };
    }
}

import axios from 'axios';

// Necesitarás una API key de TMDB
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const getRecommendedMovies = async (limit: number = 20): Promise<RecommendedMovie[]> => {
    try {
        console.log("Obteniendo películas recomendadas...");

        // 1. Obtener todas tus películas actuales
        const [favoritas, vistas] = await Promise.all([
            getMovieFav(),
            getMoviesVistas()
        ]);

        // 2. Extraer los IDs únicos de todas las películas
        const allMovieIds = new Set<string>();
        [...favoritas].forEach(movie => {
            allMovieIds.add(movie.id);
        });

        console.log(`Se encontraron ${allMovieIds.size} películas únicas para generar recomendaciones`);

        // Si no hay películas, no podemos hacer recomendaciones
        if (allMovieIds.size === 0) {
            console.warn("No hay películas para generar recomendaciones.");
            return [];
        }

        // 3. Obtener recomendaciones para cada película (con prioridad para favoritas)
        const recommendationPromises = [];

        // Primero procesamos las favoritas (mayor peso)
        for (const movie of favoritas) {
            recommendationPromises.push(fetchRecommendationsForMovie(movie.id, 2.0)); // Mayor peso
        }


        // 4. Obtener y procesar todas las recomendaciones
        const allRecommendationsArrays = await Promise.all(recommendationPromises);

        // 5. Unir todas las recomendaciones
        let allRecommendations: RecommendedMovie[] = [];
        allRecommendationsArrays.forEach(recommendations => {
            allRecommendations = [...allRecommendations, ...recommendations];
        });

        // 6. Filtrar películas que ya existen en tus colecciones
        const filteredRecommendations = allRecommendations.filter(rec =>
            !allMovieIds.has(rec.id)
        );

        // 7. Eliminar duplicados y agregar puntuaciones
        const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);

        // 8. Ordenar por puntuación (de mayor a menor)
        uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));

        // 9. Limitar el número de resultados
        const limitedRecommendations = uniqueRecommendations.slice(0, limit);

        console.log(`Se generaron ${limitedRecommendations.length} recomendaciones de películas`);

        return limitedRecommendations;
    } catch (error) {
        console.error("Error al obtener películas recomendadas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

const fetchRecommendationsForMovie = async (movieId: string, weight: number = 1.0): Promise<RecommendedMovie[]> => {
    try {
        const url = `${TMDB_BASE_URL}/movie/${movieId}/recommendations?api_key=${API_KEY}&language=es-ES`;
        const response = await axios.get(url);

        // Transformar los resultados al formato que necesitamos
        return response.data.results.map((item: any) => ({
            id: item.id.toString(),
            title: item.title,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            release_date: item.release_date,
            popularity: item.popularity,
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight // Calcular puntuación ponderada
        }));
    } catch (error) {
        console.error(`Error al obtener recomendaciones para película ${movieId}:`, error);
        return [];
    }
};

const removeDuplicatesAndCalculateScores = (recommendations: RecommendedMovie[]): RecommendedMovie[] => {
    const uniqueMap = new Map<string, RecommendedMovie>();

    // Procesar cada recomendación
    recommendations.forEach(rec => {
        const existingRec = uniqueMap.get(rec.id);

        if (existingRec) {
            // Si ya existe, combinar puntuaciones y actualizar
            const combinedScore = (existingRec.score || 0) + (rec.score || 0);
            uniqueMap.set(rec.id, {
                ...existingRec,
                score: combinedScore
            });
        } else {
            // Si no existe, agregar a map
            uniqueMap.set(rec.id, rec);
        }
    });

    // Convertir Map de vuelta a array
    return Array.from(uniqueMap.values());
};

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

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

/**
 * Función para obtener todos los pósters de una película específica
 * @param movieId ID de la película en TMDB (puede ser string o number)
 * @param language Código de idioma para filtrar pósters (opcional)
 * @returns Array con los pósters de la película
 */
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

/**
 * Obtiene la información completa de una colección
 * @param collectionId ID de la colección
 * @returns Datos completos de la colección
 */
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

