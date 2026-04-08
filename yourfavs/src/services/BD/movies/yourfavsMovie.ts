import {collection, getDocs, query, orderBy, deleteDoc, doc, getDoc, setDoc, updateDoc, deleteField} from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies'];

const LIST_TYPE_MAP: Record<string, string> = {
    'favorites': 'MovieFavs',
    'pendientes': 'MoviesPendientes',
    'vistas': 'MoviesVistas',
    'verPronto': 'MoviesVerPronto',
    'liked': 'LikedMovies',
};

export async function handleMovieFavAction(formData: FormData): Promise<string> {
    const movieId = String(formData.get('id'));
    const action = String(formData.get('action'));
    const listType = String(formData.get('list_type'));

    let genres = [];
    try {
        genres = JSON.parse(String(formData.get('genres')) || '[]');
    } catch { /* ignore */ }

    const movieDataBase = {
        id: movieId,
        poster_path: String(formData.get('poster_path') || ''),
        title: String(formData.get('title') || 'Sin nombre'),
        vote_average: Number(formData.get('vote_average') || 0),
        overview: String(formData.get('overview') || 'Sin descripción'),
        added_at: new Date(),
        genres: genres,
        release_date: String(formData.get('release_date') || ''),
    };

    // Buscar opinión existente en cualquier colección
    let existingOpinion = '';
    for (const col of MOVIE_COLLECTIONS) {
        const checkSnap = await getDoc(doc(db, col, movieId));
        if (checkSnap.exists() && checkSnap.data()?.opinion) {
            existingOpinion = checkSnap.data()?.opinion;
            break;
        }
    }

    const opinionTextForCreate = String(formData.get('opinion') || '').trim() || existingOpinion;
    const movieData = opinionTextForCreate
        ? { ...movieDataBase, opinion: opinionTextForCreate }
        : movieDataBase;

    // Guardar opinión en todas las colecciones
    if (action === 'save_opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        for (const col of MOVIE_COLLECTIONS) {
            const ref = doc(db, col, movieId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                await updateDoc(ref, { opinion: opinionText });
            }
        }
        return `/movie/${movieId}`;
    }

    // Eliminar opinión en todas las colecciones
    if (action === 'delete_opinion') {
        for (const col of MOVIE_COLLECTIONS) {
            const ref = doc(db, col, movieId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                await updateDoc(ref, { opinion: deleteField() });
            }
        }
        return `/movie/${movieId}`;
    }

    // Agregar o eliminar de una lista específica
    const collectionName = LIST_TYPE_MAP[listType];
    if (!collectionName) return `/movie/${movieId}`;

    const docRef = doc(db, collectionName, movieId);
    const docSnap = await getDoc(docRef);
    const exists = docSnap.exists();

    if (action === 'add' && !exists) {
        await setDoc(docRef, movieData);
    } else if (action === 'remove' && exists) {
        await deleteDoc(docRef);
    }

    return `/movie/${movieId}`;
}

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

interface MovieInterface {
    id: string,
    title: string;
    release_date: string;
    overview: string;
    opinion?: string;
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
    genres: number[];
}

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
            return {id: doc.id, ...doc.data()} as MovieInterface;
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
            return {id: doc.id, ...doc.data()} as MovieInterface;
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
            return {id: doc.id, ...doc.data()} as MovieInterface;
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
        console.log("Intentando obtener películas que te gustan...");

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
            return {id: doc.id, ...doc.data()} as MovieInterface;
        });

        console.log(`✅ Se obtuvieron ${result.length} películas que te gustan`);
        return result;
    } catch (error) {
        console.error("❌ Error al obtener las películas que te gustan:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        // Lanzar el error para que sea capturado en la página
        throw new Error(`Error al cargar películas que te gustan: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
            return {id: doc.id, ...doc.data()} as MovieInterface;
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

// Eliminar una película de MoviesVerPronto por ID
export async function deleteMovieVerProntoById(movieId: string) {
    try {
        await deleteDoc(doc(db, 'MoviesVerPronto', movieId));
        return {success: true};
    } catch (error) {
        console.error('Error al borrar la película:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

import axios from 'axios';

// Necesitarás una API key de TMDB
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const getRecommendedMovies = async (limit: number = 20): Promise<RecommendedMovie[]> => {
    try {
        console.log("Obteniendo películas recomendadas...");

        // Obtener listas personales
        const [favoritas, liked, vistas, pendientes, verPronto] = await Promise.all([
            getMovieFav(),
            getLikedMovies(),
            getMoviesVistas(),
            getMoviesPendientes(),
            getMoviesVerPronto(),
        ]);

        // Si no hay favoritas, no generamos recomendaciones
        if (favoritas.length === 0) {
            console.warn("No hay películas favoritas para generar recomendaciones.");
            return [];
        }

        // IDs que debemos excluir (todas las listas personales)
        const excludeMovieIds = new Set<string>([
            ...favoritas.map(m => m.id),
            ...liked.map(m => m.id),
            ...vistas.map(m => m.id),
            ...pendientes.map(m => m.id),
            ...verPronto.map(m => m.id),
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