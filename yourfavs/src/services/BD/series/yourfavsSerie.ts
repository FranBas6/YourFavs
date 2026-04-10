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
        for (const col of SERIE_COLLECTIONS) {
            const ref = doc(db, col, serieId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                await updateDoc(ref, { opinion: opinionText });
            }
        }
        return `/serie/${serieId}`;
    }

    // Eliminar opinión
    if (action === 'delete_opinion') {
        for (const col of SERIE_COLLECTIONS) {
            const ref = doc(db, col, serieId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                await updateDoc(ref, { opinion: deleteField() });
            }
        }
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
        const genres = JSON.parse(String(formData.get('genres') || '[]'));
        const seasons = JSON.parse(String(formData.get('seasons') || '[]'));
        const lastEpisodeToAir = JSON.parse(String(formData.get('last_episode_to_air') || 'null'));
        const nextEpisodeToAir = JSON.parse(String(formData.get('next_episode_to_air') || 'null'));

        const baseEntry: Record<string, any> = {
            id: serieId,
            name: String(formData.get('name') || 'Sin nombre'),
            poster_path: String(formData.get('poster_path') || ''),
            vote_average: Number(formData.get('vote_average') || 0),
            overview: String(formData.get('overview') || 'Sin descripción'),
            added_at: new Date(),
            genres, first_air_date: String(formData.get('first_air_date') || ''),
            status: String(formData.get('status') || ''),
            seasons, last_episode_to_air: lastEpisodeToAir, next_episode_to_air: nextEpisodeToAir,
            position: 0,
        };

        // Buscar opinión existente
        let existingOpinion = '';
        for (const col of SERIE_COLLECTIONS) {
            const checkSnap = await getDoc(doc(db, col, serieId));
            if (checkSnap.exists() && checkSnap.data()?.opinion) {
                existingOpinion = checkSnap.data()?.opinion;
                break;
            }
        }

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
        const results = await tmdbFetchList<any>(`/tv/${seriesId}/recommendations`);

        return results.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            first_air_date: item.first_air_date,
            popularity: item.popularity,
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight,
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

// Exportar db para que pueda ser utilizada por otros módulos si es necesario
export {db};