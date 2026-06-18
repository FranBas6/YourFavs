import { FieldValue } from "firebase-admin/firestore";
import { userCol, userDoc, getCurrentUid } from "../shared/userScope";

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

    // Refs y lectura paralela de todas las colecciones (reutilizada por los bloques de abajo)
    const refs = MOVIE_COLLECTIONS.map(col => userDoc(col, movieId));
    const snaps = await Promise.all(refs.map(ref => ref.get()));

    // Buscar opinión existente en cualquier colección
    let existingOpinion = '';
    for (const snap of snaps) {
        if (snap.exists && snap.data()?.opinion) {
            existingOpinion = snap.data()?.opinion;
            break;
        }
    }

    const opinionTextForCreate = String(formData.get('opinion') || '').trim() || existingOpinion;
    const movieData = opinionTextForCreate
        ? { ...movieDataBase, opinion: opinionTextForCreate }
        : movieDataBase;

    // Helper: aplica un patch en paralelo a todas las colecciones donde la peli existe
    const updateExisting = (patch: Record<string, any>) =>
        Promise.all(
            snaps
                .map((snap, i) => snap.exists ? refs[i].update(patch) : null)
                .filter(Boolean) as Promise<unknown>[]
        );

    if (action === 'save_opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        await updateExisting({ opinion: opinionText });
        return `/movie/${movieId}`;
    }

    if (action === 'save_rating') {
        const ratingNum = Math.max(1, Math.min(10, Number(formData.get('rating') || 0)));
        if (!ratingNum) return `/movie/${movieId}`;
        await updateExisting({ rating: ratingNum });
        // 4.2 · almacén canónico de notas con timestamp → alimenta Actividad (best-effort).
        try {
            const { setRating } = await import('../lists/ratings');
            await setRating('movie', movieId, ratingNum);
        } catch { /* la nota inline ya está guardada */ }
        return `/movie/${movieId}`;
    }

    if (action === 'delete_rating') {
        await updateExisting({ rating: FieldValue.delete() });
        try {
            const { deleteRating } = await import('../lists/ratings');
            await deleteRating('movie', movieId);
        } catch { /* ignore */ }
        return `/movie/${movieId}`;
    }

    if (action === 'delete_opinion') {
        await updateExisting({ opinion: FieldValue.delete() });
        return `/movie/${movieId}`;
    }

    // Agregar o eliminar de una lista específica
    const collectionName = LIST_TYPE_MAP[listType];
    if (!collectionName) return `/movie/${movieId}`;

    const docRef = userDoc(collectionName, movieId);
    const docSnap = await docRef.get();
    const exists = docSnap.exists;

    let mutated = false;
    if (action === 'add' && !exists) {
        await docRef.set(movieData);
        mutated = true;
        // Diario (L5): en YourFavs "visto" = Vistas ∪ Me gusta ∪ Favoritos, así que
        // entrar a cualquiera de las tres registra el visionado (fecha = hoy). dedupe:
        // solo la PRIMERA vez que entra a "visto" (mover de lista o curar algo ya
        // visto NO duplica). Pendientes/Ver pronto NO registran. Best-effort.
        if (collectionName === 'MovieFavs' || collectionName === 'LikedMovies' || collectionName === 'MoviesVistas') {
            try {
                const { appendWatchLog } = await import('../lists/watchLog');
                await appendWatchLog({ media_type: 'movie', tmdb_id: movieId, dedupe: true });
            } catch { /* diario opcional */ }
        }
    } else if (action === 'remove' && exists) {
        await docRef.delete();
        mutated = true;
    }

    // Invalida la cache de "Tus sagas" al cambiar colecciones de movies
    if (mutated) {
        try {
            const { invalidateUserCollectionsCache } = await import('../../API/shared/collectionsDiscovery');
            invalidateUserCollectionsCache();
        } catch { /* ignore */ }
        try {
            const { invalidateYearStatsCache } = await import('../../../utils/yearStats');
            invalidateYearStatsCache();
        } catch { /* ignore */ }
        try {
            const { invalidateGenrePreferencesCache } = await import('../../../utils/genrePreferences');
            invalidateGenrePreferencesCache();
        } catch { /* ignore */ }
        try {
            const { invalidatePersonalRecsCache } = await import('../../../utils/personalRecommendations');
            invalidatePersonalRecsCache();
        } catch { /* ignore */ }
        try {
            const { invalidateTopActorsCache } = await import('../../../utils/topActorsLibrary');
            invalidateTopActorsCache();
        } catch { /* ignore */ }
        try {
            const { invalidatePersonalIndexCache } = await import('../shared/personalIndex');
            invalidatePersonalIndexCache(); // 4.3 · buscador "lo mío"
        } catch { /* ignore */ }
        try {
            const { invalidateLibrarySnapshot } = await import('../shared/librarySnapshot');
            invalidateLibrarySnapshot(); // snapshot compartido de la biblioteca
        } catch { /* ignore */ }
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
    score?: number;
    genres: number[];
    sourceTitle?: string; // Título de la película favorita que generó esta recomendación
}

// Helper para obtener documentos de una colección ordenados por fecha
async function getMovieCollection(collectionName: string): Promise<MovieInterface[]> {
    if (!getCurrentUid()) return [];
    try {
        const querySnapshot = await userCol(collectionName).orderBy("added_at", "desc").get();

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

/**
 * Películas vistas con su NIVEL. Las listas son escalones excluyentes
 * (Vistas = "y ya está" · Liked = gustó · Favs = top), así que "haber visto"
 * = unión de las tres. Úsala siempre que la pregunta sea "¿la he visto?";
 * el nivel permite además mostrar EN QUÉ lista está (✓ / ♥ / ★).
 * Prioridad fav > like > visto por si un id apareciera duplicado.
 */
export type WatchedTier = 'visto' | 'like' | 'fav';

export async function getWatchedMovieTiers(): Promise<Map<number, WatchedTier>> {
    const [vistas, liked, favs] = await Promise.all([
        getMoviesVistas(),
        getLikedMovies(),
        getMovieFav(),
    ]);
    const map = new Map<number, WatchedTier>();
    for (const m of vistas) map.set(Number(m.id), 'visto');
    for (const m of liked) map.set(Number(m.id), 'like');
    for (const m of favs) map.set(Number(m.id), 'fav');
    return map;
}

export async function clearAllMoviesVerPronto(): Promise<void> {
    const querySnapshot = await userCol('MoviesVerPronto').get();

    const deletePromises: Promise<unknown>[] = [];
    querySnapshot.forEach((docSnapshot) => {
        deletePromises.push(userDoc('MoviesVerPronto', docSnapshot.id).delete());
    });

    await Promise.all(deletePromises);
}

export async function deleteMovieVerProntoById(movieId: string): Promise<void> {
    await userDoc('MoviesVerPronto', movieId).delete();
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

        // Obtener recomendaciones con source title
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
        const { tmdbFetch } = await import('../../API/shared/tmdbClient');

        // Fetch source title + recomendaciones en paralelo
        const [sourceDetail, results] = await Promise.all([
            tmdbFetch<any>(`/movie/${movieId}`).catch(() => null),
            tmdbFetchList<any>(`/movie/${movieId}/recommendations`),
        ]);

        const sourceTitle = sourceDetail?.title || '';

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
            sourceTitle,
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
