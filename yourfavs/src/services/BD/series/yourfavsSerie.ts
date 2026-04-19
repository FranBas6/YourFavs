import {collection, getDocs, query, orderBy, updateDoc, doc, deleteDoc, getDoc, setDoc, deleteField} from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto'];

const ACTION_TYPE_MAP: Record<string, string> = {
    'favs': 'SeriesFavs',
    'pendientes': 'SeriesPendiente',
    'vistas': 'SeriesVistas',
    'siguiendo': 'SeriesSiguiendo',
    'liked': 'LikedSeries',
    'verpronto': 'SeriesVerPronto',
};

export async function handleSerieFavAction(formData: FormData): Promise<string> {
    const serieId = String(formData.get('id') || formData.get('serie_id'));
    const action = String(formData.get('action'));
    const actionType = String(formData.get('actionType'));

    // Guardar opinión en todas las colecciones
    if (action === 'save_opinion' || actionType === 'opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        const refs = SERIE_COLLECTIONS.map(col => doc(db, col, serieId));
        const snaps = await Promise.all(refs.map(ref => getDoc(ref)));
        await Promise.all(
            snaps
                .filter(snap => snap.exists())
                .map(snap => updateDoc(snap.ref, { opinion: opinionText }))
        );
        return `/serie/${serieId}`;
    }

    // Guardar rating 1-10 en todas las colecciones
    if (action === 'save_rating' || actionType === 'rating') {
        const ratingNum = Math.max(1, Math.min(10, Number(formData.get('rating') || 0)));
        if (!ratingNum) return `/serie/${serieId}`;
        const refs = SERIE_COLLECTIONS.map(col => doc(db, col, serieId));
        const snaps = await Promise.all(refs.map(ref => getDoc(ref)));
        await Promise.all(
            snaps
                .filter(snap => snap.exists())
                .map(snap => updateDoc(snap.ref, { rating: ratingNum }))
        );
        return `/serie/${serieId}`;
    }

    // Eliminar rating
    if (action === 'delete_rating') {
        const refs = SERIE_COLLECTIONS.map(col => doc(db, col, serieId));
        const snaps = await Promise.all(refs.map(ref => getDoc(ref)));
        await Promise.all(
            snaps
                .filter(snap => snap.exists())
                .map(snap => updateDoc(snap.ref, { rating: deleteField() }))
        );
        return `/serie/${serieId}`;
    }

    // Eliminar opinión
    if (action === 'delete_opinion') {
        const refs = SERIE_COLLECTIONS.map(col => doc(db, col, serieId));
        const snaps = await Promise.all(refs.map(ref => getDoc(ref)));
        await Promise.all(
            snaps
                .filter(snap => snap.exists())
                .map(snap => updateDoc(snap.ref, { opinion: deleteField() }))
        );
        return `/serie/${serieId}`;
    }

    // Determinar colección
    const coleccion = ACTION_TYPE_MAP[actionType];
    if (!coleccion) throw new Error(`Tipo de acción no válido: ${actionType}`);

    const docRef = doc(db, coleccion, serieId);
    const docSnap = await getDoc(docRef);
    const serieExiste = docSnap.exists();
    const customPosition = formData.get('custom_position') ? Number(formData.get('custom_position')) : null;

    if (action === 'add' && !serieExiste) {
        const baseEntry: Record<string, any> = {
            id: serieId,
            added_at: new Date(),
        };

        // Buscar opinión existente (lectura paralela)
        const opinionSnaps = await Promise.all(
            SERIE_COLLECTIONS.map(col => getDoc(doc(db, col, serieId)))
        );
        const foundOpinion = opinionSnaps.find(s => s.exists() && s.data()?.opinion);
        const existingOpinion: string = foundOpinion?.data()?.opinion || '';

        const opinionForSeries = String(formData.get('opinion') || '').trim() || existingOpinion;
        const newEntry = opinionForSeries ? { ...baseEntry, opinion: opinionForSeries } : baseEntry;

        // Manejo de posición para favoritos
        if (coleccion === 'SeriesFavs') {
            const favsQuery = query(collection(db, 'SeriesFavs'), orderBy('position'));
            const favsSnapshot = await getDocs(favsQuery);
            const currentFavorites: SeriesFavs[] = [];
            favsSnapshot.forEach((d) => {
                currentFavorites.push({id: d.id, ...d.data()} as SeriesFavs);
            });

            let newPosition: number;
            if (customPosition !== null) {
                const seriesToUpdate = currentFavorites.filter(fav => fav.position >= customPosition);
                for (const fav of seriesToUpdate.sort((a, b) => b.position - a.position)) {
                    await updateDoc(doc(db, 'SeriesFavs', fav.id), { position: fav.position + 1 });
                }
                newPosition = customPosition;
            } else {
                newPosition = currentFavorites.length > 0
                    ? Math.max(...currentFavorites.map(f => f.position || 0)) + 1
                    : 1;
            }
            newEntry.position = newPosition;
        }

        await setDoc(docRef, newEntry);

    } else if (action === 'remove' && serieExiste) {
        await deleteDoc(docRef);

        if (coleccion === 'SeriesFavs') {
            const favsQuery = query(collection(db, 'SeriesFavs'), orderBy('position'));
            const favsSnapshot = await getDocs(favsQuery);
            const remainingFavorites: SeriesFavs[] = [];
            favsSnapshot.forEach((d) => {
                remainingFavorites.push({id: d.id, ...d.data()} as SeriesFavs);
            });
            for (let i = 0; i < remainingFavorites.length; i++) {
                await updateDoc(doc(db, 'SeriesFavs', remainingFavorites[i].id), { position: i + 1 });
            }
        }

    } else if (action === 'update' && serieExiste && coleccion === 'SeriesFavs') {
        const requestedPosition = customPosition !== null ? customPosition : Number(formData.get('custom_position'));
        if (!requestedPosition || Number.isNaN(requestedPosition)) throw new Error('Nueva posición inválida');

        const favsQuery = query(collection(db, 'SeriesFavs'), orderBy('position'));
        const favsSnapshot = await getDocs(favsQuery);
        const favorites: SeriesFavs[] = [];
        favsSnapshot.forEach((d) => {
            favorites.push({id: d.id, ...d.data()} as SeriesFavs);
        });

        if (favorites.length === 0) return `/serie/${serieId}`;

        const currentFav = favorites.find(f => f.id === serieId);
        const oldPos = currentFav?.position ?? null;
        if (oldPos === null) throw new Error('La serie no tiene posición actual definida');

        const maxPos = favorites.length;
        const newPos = Math.min(Math.max(1, requestedPosition), maxPos);

        if (newPos !== oldPos) {
            if (newPos > oldPos) {
                for (const fav of favorites.filter(f => (f.position || 0) > oldPos && (f.position || 0) <= newPos)) {
                    await updateDoc(doc(db, 'SeriesFavs', fav.id), { position: (fav.position || 0) - 1 });
                }
            } else {
                for (const fav of favorites.filter(f => (f.position || 0) >= newPos && (f.position || 0) < oldPos)) {
                    await updateDoc(doc(db, 'SeriesFavs', fav.id), { position: (fav.position || 0) + 1 });
                }
            }
            await updateDoc(docRef, { position: newPos });
        }
    }

    return `/serie/${serieId}`;
}

interface SeriesFavs {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    opinion?: string;
    added_at: Date | string;
    position: number;
    custom_order?: number;
    first_air_date?: string;
    seasons?: {
        air_date: string,
        episode_count: number,
        id: number,
        name: string,
        overview: string,
        poster_path: string,
        season_number: number
    }[];
    last_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    next_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    genres?: {
        id: number,
        name: string
    }[];
    status?: string;
}

interface SeriesInterface {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    opinion?: string;
    added_at: Date | string;
    first_air_date?: string;
    seasons?: {
        air_date: string,
        episode_count: number,
        id: number,
        name: string,
        overview: string,
        poster_path: string,
        season_number: number
    }[];
    last_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    next_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    genres?: {
        id: number,
        name: string
    }[];
    status?: string;
}

// Interfaz para las series recomendadas
interface RecommendedSeries {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    score?: number; // Puntuación calculada
    added_at?: Date | string;
    first_air_date?: string;
    seasons?: {
        air_date: string,
        episode_count: number,
        id: number,
        name: string,
        overview: string,
        poster_path: string,
        season_number: number
    }[];
    last_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    next_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    genres?: {
        id: number,
        name: string
    }[];
    status?: string;
    sourceTitle?: string;
}

export type {SeriesFavs, SeriesInterface};

// Helper para obtener documentos de una colección ordenados por fecha
async function getSeriesCollection<T>(collectionName: string, orderField: string = "added_at", orderDirection: "asc" | "desc" = "desc"): Promise<T[]> {
    try {
        const ref = collection(db, collectionName);
        const q = query(ref, orderBy(orderField, orderDirection));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return [];

        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
    } catch (error) {
        console.error(`Error al obtener ${collectionName}:`, error);
        return [];
    }
}

// getSerieFav tiene lógica especial: ordena por position e inicializa posiciones si no existen
export const getSerieFav = async (): Promise<SeriesFavs[]> => {
    try {
        const result = await getSeriesCollection<SeriesFavs>("SeriesFavs", "position", "asc");
        if (result.length === 0) return [];

        const seriesWithOrder: SeriesFavs[] = result.map((series, index) => ({
            ...series,
            custom_order: series.position ?? index,
        }));

        if (seriesWithOrder.every(series => series.position === null || series.position === undefined)) {
            await Promise.all(
                seriesWithOrder.map((series, index) => {
                    const serieRef = doc(db, "SeriesFavs", series.id);
                    return updateDoc(serieRef, { position: index });
                })
            );
        }

        return seriesWithOrder;
    } catch (error) {
        console.error("Error al obtener las series favoritas:", error);
        return [];
    }
};

export const getSeriesPendientes = () => getSeriesCollection<SeriesInterface>("SeriesPendiente");
export const getSeriesVistas = () => getSeriesCollection<SeriesInterface>("SeriesVistas");
export const getSeriesSiguiendo = () => getSeriesCollection<SeriesInterface>("SeriesSiguiendo");
export const getLikedSeries = () => getSeriesCollection<SeriesInterface>("LikedSeries");
export const getSeriesVerPronto = () => getSeriesCollection<SeriesInterface>("SeriesVerPronto");

export async function clearAllSeriesVerPronto(): Promise<void> {
    const seriesVerProntoRef = collection(db, 'SeriesVerPronto');
    const querySnapshot = await getDocs(seriesVerProntoRef);

    const deletePromises: Promise<void>[] = [];
    querySnapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(db, 'SeriesVerPronto', docSnapshot.id)));
    });

    await Promise.all(deletePromises);
}

export async function deleteSerieVerProntoById(serieId: string): Promise<void> {
    await deleteDoc(doc(db, 'SeriesVerPronto', serieId));
}

import { processBatch } from '../../../utils/processBatch';
import { tmdbFetchList } from '../../API/shared/tmdbClient';

export const getRecommendedSeries = async (limit: number = 20): Promise<RecommendedSeries[]> => {
    try {
        // Obtener todas las listas (incluyendo vistas y pendientes para exclusión completa)
        const [favoritas, siguiendo, gustadas, vistas, pendientes, verPronto] = await Promise.all([
            getSerieFav(),
            getSeriesSiguiendo(),
            getLikedSeries(),
            getSeriesVistas(),
            getSeriesPendientes(),
            getSeriesVerPronto(),
        ]);

        // IDs a excluir de las recomendaciones (todas las colecciones)
        const excludeIds = new Set<string>();
        [...favoritas, ...siguiendo, ...gustadas, ...vistas, ...pendientes, ...verPronto]
            .forEach(serie => excludeIds.add(serie.id));

        if (favoritas.length === 0 && siguiendo.length === 0 && gustadas.length === 0) {
            return [];
        }

        // Construir lista de series a consultar con sus pesos, deduplicando por ID
        const processedIds = new Set<string>();
        const seriesToFetch: { id: string; weight: number }[] = [];

        for (const serie of favoritas) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 2.0 });
            }
        }
        for (const serie of siguiendo) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 1.75 });
            }
        }
        for (const serie of gustadas) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 1.5 });
            }
        }

        // Obtener recomendaciones en lotes de 5 para respetar rate limits de TMDB
        const allRecommendationsArrays = await processBatch(
            seriesToFetch,
            (item) => fetchRecommendationsForSeries(item.id, item.weight),
            5
        );

        const allRecommendations = allRecommendationsArrays.flat();

        // Filtrar, deduplicar, ordenar y limitar
        const filteredRecommendations = allRecommendations.filter(rec =>
            !excludeIds.has(rec.id)
        );

        const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);
        uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));

        return uniqueRecommendations.slice(0, limit);
    } catch (error) {
        console.error("Error al obtener series recomendadas:", error);
        return [];
    }
};

const fetchRecommendationsForSeries = async (seriesId: string, weight: number = 1.0): Promise<RecommendedSeries[]> => {
    try {
        const { tmdbFetch } = await import('../../API/shared/tmdbClient');

        const [sourceDetail, results] = await Promise.all([
            tmdbFetch<any>(`/tv/${seriesId}`).catch(() => null),
            tmdbFetchList<any>(`/tv/${seriesId}/recommendations`),
        ]);

        const sourceTitle = sourceDetail?.name || '';

        return results.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            first_air_date: item.first_air_date,
            popularity: item.popularity,
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight,
            sourceTitle,
        }));
    } catch (error) {
        console.error(`Error al obtener recomendaciones para serie ${seriesId}:`, error);
        return [];
    }
};

const removeDuplicatesAndCalculateScores = (recommendations: RecommendedSeries[]): RecommendedSeries[] => {
    const uniqueMap = new Map<string, RecommendedSeries>();

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

// === Watched Episodes ===

interface WatchedEpisode {
    season: number;
    episode: number;
    watched_at: string;
}

interface WatchedProgress {
    id: string;
    watched_episodes: WatchedEpisode[];
    last_watched: WatchedEpisode | null;
}

export type { WatchedProgress, WatchedEpisode };

export async function getWatchedProgress(serieId: string): Promise<WatchedProgress | null> {
    try {
        const snap = await getDoc(doc(db, 'WatchedEpisodes', serieId));
        if (!snap.exists()) return null;
        return snap.data() as WatchedProgress;
    } catch (error) {
        console.error('Error al obtener progreso:', error);
        return null;
    }
}

export async function toggleWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const ref = doc(db, 'WatchedEpisodes', serieId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        // Primer episodio marcado — crear documento
        const ep: WatchedEpisode = { season, episode, watched_at: new Date().toISOString() };
        await setDoc(ref, {
            id: serieId,
            watched_episodes: [ep],
            last_watched: ep,
        });
        return;
    }

    const data = snap.data() as WatchedProgress;
    const episodes = data.watched_episodes || [];
    const idx = episodes.findIndex(e => e.season === season && e.episode === episode);

    if (idx >= 0) {
        // Ya visto — quitar
        episodes.splice(idx, 1);
        await updateDoc(ref, {
            watched_episodes: episodes,
            last_watched: episodes.length > 0 ? episodes[episodes.length - 1] : null,
        });
    } else {
        // No visto — añadir
        const ep: WatchedEpisode = { season, episode, watched_at: new Date().toISOString() };
        episodes.push(ep);
        await updateDoc(ref, {
            watched_episodes: episodes,
            last_watched: ep,
        });
    }
}

export async function markSeasonWatched(serieId: string, season: number, episodeNumbers: number[]): Promise<void> {
    const ref = doc(db, 'WatchedEpisodes', serieId);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();

    const newEpisodes: WatchedEpisode[] = episodeNumbers.map(ep => ({ season, episode: ep, watched_at: now }));

    if (!snap.exists()) {
        const last = newEpisodes[newEpisodes.length - 1];
        await setDoc(ref, { id: serieId, watched_episodes: newEpisodes, last_watched: last });
        return;
    }

    const data = snap.data() as WatchedProgress;
    // Quitar episodios de esta temporada que ya estén y reemplazar con todos
    const otherEpisodes = (data.watched_episodes || []).filter(e => e.season !== season);
    const allEpisodes = [...otherEpisodes, ...newEpisodes];
    await updateDoc(ref, {
        watched_episodes: allEpisodes,
        last_watched: allEpisodes[allEpisodes.length - 1],
    });
}

export async function unmarkSeasonWatched(serieId: string, season: number): Promise<void> {
    const ref = doc(db, 'WatchedEpisodes', serieId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data() as WatchedProgress;
    const remaining = (data.watched_episodes || []).filter(e => e.season !== season);
    await updateDoc(ref, {
        watched_episodes: remaining,
        last_watched: remaining.length > 0 ? remaining[remaining.length - 1] : null,
    });
}

export async function markAllWatched(serieId: string, allEpisodes: { season: number; episode: number }[]): Promise<void> {
    const ref = doc(db, 'WatchedEpisodes', serieId);
    const now = new Date().toISOString();
    const episodes: WatchedEpisode[] = allEpisodes.map(e => ({ season: e.season, episode: e.episode, watched_at: now }));
    const last = episodes[episodes.length - 1];
    await setDoc(ref, { id: serieId, watched_episodes: episodes, last_watched: last });
}

export async function unmarkAllWatched(serieId: string): Promise<void> {
    const ref = doc(db, 'WatchedEpisodes', serieId);
    await deleteDoc(ref);
}

export async function getWatchedProgressBatch(serieIds: string[]): Promise<Record<string, { watched: number; total?: number }>> {
    if (serieIds.length === 0) return {};
    const results = await Promise.all(
        serieIds.map(id => getWatchedProgress(id))
    );
    const map: Record<string, { watched: number }> = {};
    for (let i = 0; i < serieIds.length; i++) {
        if (results[i] && results[i]!.watched_episodes.length > 0) {
            map[serieIds[i]] = { watched: results[i]!.watched_episodes.length };
        }
    }
    return map;
}

// Exportar db para que pueda ser utilizada por otros módulos si es necesario
export {db};