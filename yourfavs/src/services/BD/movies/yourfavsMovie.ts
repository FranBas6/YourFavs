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

    const movieDataBase = {
        id: movieId,
        added_at: new Date(),
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

// Helper para obtener documentos de una colección ordenados por fecha
async function getMovieCollection(collectionName: string): Promise<MovieInterface[]> {
    try {
        const ref = collection(db, collectionName);
        const q = query(ref, orderBy("added_at", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return [];

        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MovieInterface));
    } catch (error) {
        console.error(`Error al obtener ${collectionName}:`, error);
        return [];
    }
}

export const getMovieFav = () => getMovieCollection("MovieFavs");
export const getMoviesPendientes = () => getMovieCollection("MoviesPendientes");
export const getMoviesVistas = () => getMovieCollection("MoviesVistas");
export const getLikedMovies = () => getMovieCollection("LikedMovies");
export const getMoviesVerPronto = () => getMovieCollection("MoviesVerPronto");

export async function clearAllMoviesVerPronto(): Promise<void> {
    const peliculasVerProntoRef = collection(db, 'MoviesVerPronto');
    const querySnapshot = await getDocs(peliculasVerProntoRef);

    const deletePromises: Promise<void>[] = [];
    querySnapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(db, 'MoviesVerPronto', docSnapshot.id)));
    });

    await Promise.all(deletePromises);
}

export async function deleteMovieVerProntoById(movieId: string): Promise<void> {
    await deleteDoc(doc(db, 'MoviesVerPronto', movieId));
}

import { processBatch } from '../../../utils/processBatch';
import { tmdbFetchList } from '../../API/shared/tmdbClient';

export const getRecommendedMovies = async (limit: number = 20): Promise<RecommendedMovie[]> => {
    try {
        const [favoritas, liked, vistas, pendientes, verPronto] = await Promise.all([
            getMovieFav(),
            getLikedMovies(),
            getMoviesVistas(),
            getMoviesPendientes(),
            getMoviesVerPronto(),
        ]);

        if (favoritas.length === 0) return [];

        // IDs que debemos excluir (todas las listas personales)
        const excludeMovieIds = new Set<string>([
            ...favoritas.map(m => m.id),
            ...liked.map(m => m.id),
            ...vistas.map(m => m.id),
            ...pendientes.map(m => m.id),
            ...verPronto.map(m => m.id),
        ]);

        // Obtener recomendaciones en lotes de 5 para respetar rate limits de TMDB
        const allRecommendationsArrays = await processBatch(
            favoritas,
            (movie) => fetchRecommendationsForMovie(movie.id, 2.0),
            5
        );

        const allRecommendations = allRecommendationsArrays.flat();

        // Filtrar, deduplicar, ordenar y limitar
        const filteredRecommendations = allRecommendations.filter(rec =>
            !excludeMovieIds.has(rec.id)
        );

        const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);
        uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));

        return uniqueRecommendations.slice(0, limit);
    } catch (error) {
        console.error("Error al obtener películas recomendadas:", error);
        return [];
    }
};

const fetchRecommendationsForMovie = async (movieId: string, weight: number = 1.0): Promise<RecommendedMovie[]> => {
    try {
        const results = await tmdbFetchList<any>(`/movie/${movieId}/recommendations`);

        return results.map((item: any) => ({
            id: item.id.toString(),
            title: item.title,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            release_date: item.release_date,
            popularity: item.popularity,
            genres: item.genre_ids || [],
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight,
        }));
    } catch (error) {
        console.error(`Error al obtener recomendaciones para película ${movieId}:`, error);
        return [];
    }
};

const removeDuplicatesAndCalculateScores = (recommendations: RecommendedMovie[]): RecommendedMovie[] => {
    const uniqueMap = new Map<string, RecommendedMovie>();

    for (const rec of recommendations) {
        const existing = uniqueMap.get(rec.id);
        if (existing) {
            uniqueMap.set(rec.id, { ...existing, score: (existing.score || 0) + (rec.score || 0) });
        } else {
            uniqueMap.set(rec.id, rec);
        }
    }

    return Array.from(uniqueMap.values());
};