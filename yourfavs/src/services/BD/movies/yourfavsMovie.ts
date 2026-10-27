import {
    titleMembership, listCollection, inCollection, addToCollections, removeFromCollections,
    clearCollection, patchTitle,
} from "../shared/library";
import { getTransition } from "../shared/stateTransitions";
import { normalizeScore } from "../../../utils/constants/helpers/media-helpers";

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies', 'MoviesViendo'];

const LIST_TYPE_MAP: Record<string, string> = {
    'favorites': 'MovieFavs',
    'pendientes': 'MoviesPendientes',
    'vistas': 'MoviesVistas',
    'verPronto': 'MoviesVerPronto',
    'liked': 'LikedMovies',
    'viendo': 'MoviesViendo',
};

/** Vacía las cachés de «Para ti» (semillas y resultado) de este usuario. */
async function bustRecs(): Promise<void> {
    try {
        const [{ invalidateGenrePreferencesCache }, { invalidatePersonalRecsCache }] = await Promise.all([
            import('../../../utils/genrePreferences'), import('../../../utils/personalRecommendations'),
        ]);
        invalidateGenrePreferencesCache();
        invalidatePersonalRecsCache();
    } catch { /* la caché caduca sola */ }
}

export async function handleMovieFavAction(formData: FormData): Promise<string> {
    const movieId = String(formData.get('id'));
    const action = String(formData.get('action'));
    const listType = String(formData.get('list_type'));

    // "Terminada" (Bloque 2): terminar la sesión de visionado. Distingue primer
    // visionado (→ Vistas) de re-visionado (→ pase en el diario). Ver finishViewingMovie.
    if (action === 'finish_viewing') {
        await finishViewingMovie(movieId);
        return `/movie/${movieId}`;
    }

    // En qué listas está ya la peli: UNA consulta (reutilizada por los bloques de abajo).
    const membership = await titleMembership('movie', movieId);

    // Buscar opinión + nota existentes en cualquier colección (se copian al mover/añadir
    // en cascada para no perderlas al reubicar el título entre listas).
    let existingOpinion = '';
    let existingRating: number | undefined;
    for (const col of MOVIE_COLLECTIONS) {
        const row = membership.get(col);
        if (!row) continue;
        if (!existingOpinion && row.opinion) existingOpinion = row.opinion;
        if (existingRating === undefined && row.rating !== null) existingRating = Number(row.rating);
    }

    const opinionTextForCreate = String(formData.get('opinion') || '').trim() || existingOpinion;
    const movieData: { opinion?: string; rating?: number } = {};
    if (opinionTextForCreate) movieData.opinion = opinionTextForCreate;
    if (existingRating !== undefined) movieData.rating = existingRating;

    // Aplica un patch a todas las colecciones donde la peli existe (un UPDATE).
    const updateExisting = (patch: { opinion?: string | null; rating?: number | null }) =>
        patchTitle('movie', movieId, patch);

    if (action === 'save_opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        await updateExisting({ opinion: opinionText });
        return `/movie/${movieId}`;
    }

    if (action === 'save_rating') {
        const ratingNum = normalizeScore(formData.get('rating'));
        if (!ratingNum) return `/movie/${movieId}`;
        await updateExisting({ rating: ratingNum });
        // 4.2 · almacén canónico de notas con timestamp → alimenta Actividad (best-effort).
        try {
            const { setRating } = await import('../lists/ratings');
            await setRating('movie', movieId, ratingNum);
        } catch { /* la nota inline ya está guardada */ }
        await bustRecs(); // una nota ≥ 8 siembra «Para ti»
        return `/movie/${movieId}`;
    }

    if (action === 'delete_rating') {
        await updateExisting({ rating: null });
        await bustRecs();
        try {
            const { deleteRating } = await import('../lists/ratings');
            await deleteRating('movie', movieId);
        } catch { /* ignore */ }
        return `/movie/${movieId}`;
    }

    if (action === 'delete_opinion') {
        await updateExisting({ opinion: null });
        return `/movie/${movieId}`;
    }

    // Agregar o eliminar de una lista específica
    const collectionName = LIST_TYPE_MAP[listType];
    if (!collectionName) return `/movie/${movieId}`;

    const exists = membership.has(collectionName);

    let mutated = false;
    let logPase = false;
    if (action === 'add' && !exists) {
        // Modelo de 2 capas: aplica la transición (mover + limpiar). Marcar Visto/Fav/Me gusta
        // añade "Vistas" y limpia el progreso; Fav/Me gusta se excluyen entre sí. Ver
        // stateTransitions.ts. Primero las altas y luego las bajas: si algo fallara a medias,
        // el título queda en una lista de más, nunca en ninguna.
        const tr = getTransition('movie', collectionName);
        await addToCollections(movieId, [collectionName, ...tr.alsoAdd.filter(c => !membership.has(c))]
            .map(collection => ({ collection, ...movieData })));
        await removeFromCollections(movieId, tr.remove.filter(c => membership.has(c)));
        mutated = true;
        logPase = tr.logPase;
        // Diario (L5): cada entrada a "visto" registra el visionado (fecha = hoy). dedupe:
        // solo la PRIMERA vez (mover de lista o curar algo ya visto NO duplica el pase).
        if (logPase) {
            try {
                const { appendWatchLog } = await import('../lists/watchLog');
                await appendWatchLog({ media_type: 'movie', tmdb_id: movieId, dedupe: true });
            } catch { /* diario opcional */ }
        }
    } else if (action === 'remove' && exists) {
        // Quitar es un borrado simple: no auto-restaura estados previos.
        await removeFromCollections(movieId, [collectionName]);
        mutated = true;
        // §5 · bitácora (best-effort): quitar de una lista es intencional y NO derivable
        // (se pierde el added_at). Los borrados en cascada del branch 'add' NO llegan aquí.
        try {
            const { appendActivity } = await import('../shared/activityLog');
            await appendActivity({ verb: 'remove', media_type: 'movie', tmdb_id: movieId, meta: { collection: collectionName } });
        } catch { /* bitácora opcional */ }
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
        try {
            const { invalidateActivityFeed } = await import('../shared/activityFeed');
            invalidateActivityFeed(); // §5 · altas/bajas salen en el feed
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
    try {
        return (await listCollection(collectionName, 'added_at', 'desc')) as unknown as MovieInterface[];
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
// "Viendo" (Bloque 2): pelis que estás viendo ahora mismo. Alimenta la franja
// "Estás viendo" del Home. Solo pelis (las series ya tienen progreso por episodios).
export const getMoviesViendo = () => getMovieCollection("MoviesViendo");

/**
 * "Terminada": cierra la sesión de visionado de una peli en "Viendo".
 *  - Primer visionado (aún no en Vistas): la marca como Vista (la transición limpia
 *    Viendo/Pendientes/Ver pronto y registra el visionado base).
 *  - Re-visionado (ya en Vistas): sale de Viendo y registra un PASE en el diario
 *    (sin dedupe → cuenta como "vuelta a ver"), preservando Vistas y la opinión.
 */
export async function finishViewingMovie(movieId: string): Promise<void> {
    const wasVista = await inCollection('MoviesVistas', movieId);

    if (!wasVista) {
        const fd = new FormData();
        fd.set('id', movieId);
        fd.set('action', 'add');
        fd.set('list_type', 'vistas');
        await handleMovieFavAction(fd); // reutiliza transición + diario + invalidaciones
        return;
    }

    // Re-visionado terminado: fuera de Viendo + pase en el diario.
    await removeFromCollections(movieId, ['MoviesViendo']);
    try {
        const { appendWatchLog } = await import('../lists/watchLog');
        await appendWatchLog({ media_type: 'movie', tmdb_id: movieId }); // sin dedupe → pase
    } catch { /* diario opcional */ }
    try {
        const { invalidateLibrarySnapshot } = await import('../shared/librarySnapshot');
        invalidateLibrarySnapshot();
    } catch { /* ignore */ }
    try {
        const { invalidateYearStatsCache } = await import('../../../utils/yearStats');
        invalidateYearStatsCache();
    } catch { /* ignore */ }
}

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

/**
 * Vistas "a secas": consumido SIN opinión más fuerte (excluye Favoritos y Me gusta).
 * En el modelo de 2 capas, Favs/Me gusta también viven en Vistas (paraguas "consumido"),
 * así que la página /mislistas/vistos las excluye para no duplicar entre listas.
 */
export const getMoviesVistasSolo = async (): Promise<MovieInterface[]> => {
    const [vistas, liked, favs] = await Promise.all([getMoviesVistas(), getLikedMovies(), getMovieFav()]);
    const exclude = new Set<string>([...liked.map(m => m.id), ...favs.map(m => m.id)]);
    return vistas.filter(m => !exclude.has(m.id));
};

export async function clearAllMoviesVerPronto(): Promise<void> {
    await clearCollection('MoviesVerPronto');
}

export async function deleteMovieVerProntoById(movieId: string): Promise<void> {
    await removeFromCollections(movieId, ['MoviesVerPronto']);
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
