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

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

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

export type {SeriesFavs, SeriesInterface};

// Función para obtener series favoritas
export const getSerieFav = async (): Promise<SeriesFavs[]> => {
    try {
        console.log("Intentando obtener series favoritas...");

        // Crear una referencia a la colección
        const seriesFavsRef = collection(db, "SeriesFavs");

        // Consultar ordenando por position
        const q = query(seriesFavsRef, orderBy("position"));
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesFavs[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesFavs);
        });

        console.log("Resultado de la consulta:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series favoritas.");
            return [];
        }

        // Si no hay position establecido, inicializar basado en el orden por defecto
        const seriesWithOrder: SeriesFavs[] = result.map((series, index) => ({
            ...series,
            custom_order: series.position ?? index
        }));

        // Si ninguna serie tiene position, establecer orden inicial
        if (seriesWithOrder.every(series => series.position === null || series.position === undefined)) {
            await Promise.all(
                seriesWithOrder.map((series, index) => {
                    const serieRef = doc(db, "SeriesFavs", series.id);
                    return updateDoc(serieRef, {position: index});
                })
            );
        }

        return seriesWithOrder;
    } catch (error) {
        console.error("Error al obtener las series favoritas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para obtener series pendientes ordenadas por fecha de añadido (más reciente primero)
export const getSeriesPendientes = async (): Promise<SeriesInterface[]> => {
    try {
        console.log("Intentando obtener series pendientes...");

        // Crear una referencia a la colección con ordenamiento
        const seriesPendientesRef = collection(db, "SeriesPendiente");
        const q = query(seriesPendientesRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesInterface[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesInterface);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series pendientes.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener las series pendientes:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para obtener series vistas ordenadas por fecha de añadido (más reciente primero)
export const getSeriesVistas = async (): Promise<SeriesInterface[]> => {
    try {
        console.log("Intentando obtener series vistas...");

        // Crear una referencia a la colección con ordenamiento
        const seriesVistasRef = collection(db, "SeriesVistas");
        const q = query(seriesVistasRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesInterface[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesInterface);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series vistas.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener las series vistas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para obtener series siguiendo ordenadas por fecha de añadido (más reciente primero)
export const getSeriesSiguiendo = async (): Promise<SeriesInterface[]> => {
    try {
        console.log("Intentando obtener series siguiendo...");

        // Crear una referencia a la colección con ordenamiento
        const seriesSiguiendoRef = collection(db, "SeriesSiguiendo");
        const q = query(seriesSiguiendoRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesInterface[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesInterface);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series siguiendo.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener las series siguiendo:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para obtener series que te han gustado ordenadas por fecha de añadido (más reciente primero)
export const getLikedSeries = async (): Promise<SeriesInterface[]> => {
    try {
        console.log("Intentando obtener series que te gustan...");

        // Crear una referencia a la colección con ordenamiento
        const likedSeriesRef = collection(db, "LikedSeries");
        const q = query(likedSeriesRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesInterface[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesInterface);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series que te gustan.");
            return [];
        }

        console.log(`✅ Se obtuvieron ${result.length} series que te gustan`);
        return result;
    } catch (error) {
        console.error("❌ Error al obtener las series que te gustan:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        // Lanzar el error para que sea capturado en la página
        throw new Error(`Error al cargar series que te gustan: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
};

// Función para obtener series pendientes ordenadas por fecha de añadido (más reciente primero)
export const getSeriesVerPronto = async (): Promise<SeriesInterface[]> => {
    try {
        console.log("Intentando obtener series para ver pronto...");

        // Crear una referencia a la colección con ordenamiento
        const seriesVerProntoRef = collection(db, "SeriesVerPronto");
        const q = query(seriesVerProntoRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesInterface[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesInterface);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series para ver pronto.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener las series para ver pronto:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

export async function clearAllSeriesVerPronto() {
    try {
        const seriesVerProntoRef = collection(db, 'SeriesVerPronto');
        const querySnapshot = await getDocs(seriesVerProntoRef);

        const deletePromises: Promise<void>[] = [];
        querySnapshot.forEach((docSnapshot) => {
            deletePromises.push(deleteDoc(doc(db, 'SeriesVerPronto', docSnapshot.id)));
        });

        await Promise.all(deletePromises);

        return {
            success: true,
            deletedCount: deletePromises.length,
            message: `Se borraron ${deletePromises.length} series exitosamente`
        };

    } catch (error) {
        console.error('Error al borrar todas las series:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Error al borrar las series'
        };
    }
}

// Eliminar una serie de SeriesVerPronto por ID
export async function deleteSerieVerProntoById(serieId: string) {
    try {
        await deleteDoc(doc(db, 'SeriesVerPronto', serieId));
        return {success: true};
    } catch (error) {
        console.error('Error al borrar la serie:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const getRecommendedSeries = async (limit: number = 20): Promise<RecommendedSeries[]> => {
    try {
        console.log("Obteniendo series recomendadas...");

        // 1. Obtener todas tus series actuales
        const [favoritas, siguiendo, gustadas] = await Promise.all([
            getSerieFav(),
            getSeriesSiguiendo(),
            getLikedSeries()
        ]);

        // 2. Extraer los IDs únicos de todas las series
        const allSeriesIds = new Set<string>();
        [...favoritas, ...siguiendo, ...gustadas].forEach(serie => {
            allSeriesIds.add(serie.id);
        });

        console.log(`Se encontraron ${allSeriesIds.size} series únicas para generar recomendaciones`);

        // Si no hay series, no podemos hacer recomendaciones
        if (allSeriesIds.size === 0) {
            console.warn("No hay series para generar recomendaciones.");
            return [];
        }

        // 3. Obtener recomendaciones para cada serie (con prioridad para favoritas)
        const recommendationPromises = [];

        // Primero procesamos las favoritas (mayor peso)
        for (const serie of favoritas) {
            recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 2.0)); // Mayor peso
        }

        // Luego las que estás siguiendo (peso medio-alto)
        for (const serie of siguiendo) {
            // Evitamos duplicados que ya estén en favoritas
            if (!favoritas.some(fav => fav.id === serie.id)) {
                recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1.75));
            }
        }

        // Luego las que te han gustado (peso medio)
        for (const serie of gustadas) {
            // Evitamos duplicados que ya estén en favoritas
            if (!favoritas.some(fav => fav.id === serie.id)) {
                recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1.5));
            }
        }

        // 4. Obtener y procesar todas las recomendaciones
        const allRecommendationsArrays = await Promise.all(recommendationPromises);

        // 5. Unir todas las recomendaciones
        let allRecommendations: RecommendedSeries[] = [];
        allRecommendationsArrays.forEach(recommendations => {
            allRecommendations = [...allRecommendations, ...recommendations];
        });

        // 6. Filtrar series que ya existen en tus colecciones
        const filteredRecommendations = allRecommendations.filter(rec =>
            !allSeriesIds.has(rec.id)
        );

        // 7. Eliminar duplicados y agregar puntuaciones
        const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);

        // 8. Ordenar por puntuación (de mayor a menor)
        uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));

        // 9. Limitar el número de resultados
        const limitedRecommendations = uniqueRecommendations.slice(0, limit);

        console.log(`Se generaron ${limitedRecommendations.length} recomendaciones de series`);

        return limitedRecommendations;
    } catch (error) {
        console.error("Error al obtener series recomendadas:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

const fetchRecommendationsForSeries = async (seriesId: string, weight: number = 1.0): Promise<RecommendedSeries[]> => {
    try {
        const url = `${TMDB_BASE_URL}/tv/${seriesId}/recommendations?api_key=${API_KEY}&language=es-ES`;
        const response = await axios.get(url);

        // Transformar los resultados al formato que necesitamos
        return response.data.results.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            first_air_date: item.first_air_date,
            popularity: item.popularity,
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight // Calcular puntuación ponderada
        }));
    } catch (error) {
        console.error(`Error al obtener recomendaciones para serie ${seriesId}:`, error);
        return [];
    }
};

const removeDuplicatesAndCalculateScores = (recommendations: RecommendedSeries[]): RecommendedSeries[] => {
    const uniqueMap = new Map<string, RecommendedSeries>();

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

// Exportar db para que pueda ser utilizada por otros módulos si es necesario
export {db};