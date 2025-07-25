import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, deleteDoc, doc } from "firebase/firestore";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

interface MovieInterface {
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
export const getMovieFav = async (): Promise<MovieInterface[]> => {
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
        const result: MovieInterface[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieInterface;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas favoritas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas pendientes ordenadas por fecha de añadido (más reciente primero)
export const getMoviesPendientes = async (): Promise<MovieInterface[]> => {
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
        const result: MovieInterface[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieInterface;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas pendientes:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas vistas ordenadas por fecha de añadido (más reciente primero)
export const getMoviesVistas = async (): Promise<MovieInterface[]> => {
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
        const result: MovieInterface[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieInterface;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas vistas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas vistas ordenadas por fecha de añadido (más reciente primero)
export const getLikedMovies = async (): Promise<MovieInterface[]> => {
    try {
        console.log("Intentando obtener películas vistas...");

        // Referencia a la colección de películas vistas con ordenamiento
        const likedMoviesRef = collection(db, "LikedMovies");
        const q = query(likedMoviesRef, orderBy("added_at", "desc"));

        // Obtener documentos ordenados
        const querySnapshot = await getDocs(q);

        console.log("Resultado de la consulta ordenado:", querySnapshot);

        if (querySnapshot.empty) {
            console.warn("No se encontraron películas que te gustan.");
            return [];
        }

        // Convertir los documentos a un array de datos con el tipo MoviesVistas
        const result: MovieInterface[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieInterface;
        });

        return result;
    } catch (error) {
        console.error("Error al obtener las películas vistas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Obtener películas para ver pronto ordenadas por fecha de añadido (más reciente primero)
export const getMoviesVerPronto = async (): Promise<MovieInterface[]> => {
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
        const result: MovieInterface[] = querySnapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as MovieInterface;
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

        // Solo favoritas como base
        const favoritas = await getMovieFav();
        const vistas = await getMoviesVistas();

        // Si no hay favoritas, no generamos recomendaciones
        if (favoritas.length === 0) {
            console.warn("No hay películas favoritas para generar recomendaciones.");
            return [];
        }

        // IDs que debemos excluir (favoritas + vistas)
        const excludeMovieIds = new Set<string>([
            ...favoritas.map(m => m.id),
            ...vistas.map(m => m.id)
        ]);

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
            !excludeMovieIds.has(rec.id)
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