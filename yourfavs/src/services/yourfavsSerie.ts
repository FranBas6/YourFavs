import {type APISerie, type Serie} from "../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, updateDoc, doc, deleteDoc } from "firebase/firestore";

interface SeriesFavs {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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

interface SeriesPendiente {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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

interface SeriesVistas {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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

interface SeriesSiguiendo {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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

interface LikedSeries {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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

interface SeriesVerPronto {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
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
    first_air_date?: string;
    popularity?: number;
    score?: number; // Puntuación personalizada para ordenar recomendaciones
    genres?: {
        id: number,
        name: string
    }[];
    status?: string;
}

export type { SeriesFavs, SeriesPendiente, SeriesVistas, SeriesSiguiendo, LikedSeries };

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

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
                    return updateDoc(serieRef, { position: index });
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
export const getSeriesPendientes = async (): Promise<SeriesPendiente[]> => {
    try {
        console.log("Intentando obtener series pendientes...");

        // Crear una referencia a la colección con ordenamiento
        const seriesPendientesRef = collection(db, "SeriesPendiente");
        const q = query(seriesPendientesRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesPendiente[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesPendiente);
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
export const getSeriesVistas = async (): Promise<SeriesVistas[]> => {
    try {
        console.log("Intentando obtener series vistas...");

        // Crear una referencia a la colección con ordenamiento
        const seriesVistasRef = collection(db, "SeriesVistas");
        const q = query(seriesVistasRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesVistas[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesVistas);
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
export const getSeriesSiguiendo = async (): Promise<SeriesSiguiendo[]> => {
    try {
        console.log("Intentando obtener series siguiendo...");

        // Crear una referencia a la colección con ordenamiento
        const seriesSiguiendoRef = collection(db, "SeriesSiguiendo");
        const q = query(seriesSiguiendoRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesSiguiendo[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesSiguiendo);
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
export const getLikedSeries = async (): Promise<LikedSeries[]> => {
    try {
        console.log("Intentando obtener series que te gustan...");

        // Crear una referencia a la colección con ordenamiento
        const likedSeriesRef = collection(db, "LikedSeries");
        const q = query(likedSeriesRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: LikedSeries[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as LikedSeries);
        });

        console.log("Resultado de la consulta ordenado:", result);

        if (result.length === 0) {
            console.warn("No se encontraron series que te gustan.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener las series que te gustan:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para obtener series pendientes ordenadas por fecha de añadido (más reciente primero)
export const getSeriesVerPronto = async (): Promise<SeriesVerPronto[]> => {
    try {
        console.log("Intentando obtener series para ver pronto...");

        // Crear una referencia a la colección con ordenamiento
        const seriesVerProntoRef = collection(db, "SeriesVerPronto");
        const q = query(seriesVerProntoRef, orderBy("added_at", "desc"));

        // Obtener todos los documentos de la colección ordenados
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: SeriesVerPronto[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as SeriesVerPronto);
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

import axios from 'axios';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const getRecommendedSeries = async (limit: number = 20): Promise<RecommendedSeries[]> => {
    try {
        console.log("Obteniendo series recomendadas...");

        // 1. Obtener todas tus series actuales
        const [favoritas, vistas, gustadas] = await Promise.all([
            getSerieFav(),
            getSeriesVistas(),
            getLikedSeries()
        ]);

        // 2. Extraer los IDs únicos de todas las series
        const allSeriesIds = new Set<string>();
        [...favoritas, ...vistas, ...gustadas].forEach(serie => {
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

        // Luego las que te han gustado (peso medio)
        for (const serie of gustadas) {
            // Evitamos duplicados que ya estén en favoritas
            if (!favoritas.some(fav => fav.id === serie.id)) {
                recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1.5));
            }
        }

        // Finalmente las vistas (peso normal)
        for (const serie of vistas) {
            // Evitamos duplicados
            if (!favoritas.some(fav => fav.id === serie.id) &&
                !gustadas.some(liked => liked.id === serie.id)) {
                recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1.0));
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
export { db };

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

// Obtener series en emisión
export const getLatestSeries = async ({ page }: { page?: string }): Promise<Serie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(today.getDate() + 7);

        const filteredSeries = series.filter((serie) => {
            const firstAirDate = serie.first_air_date ? new Date(serie.first_air_date) : null;
            const nextEpisodeDate = serie.next_episode_to_air?.air_date ? new Date(serie.next_episode_to_air.air_date) : null;

            if (firstAirDate && firstAirDate > oneWeekLater) {
                // No mostrar si aún no ha empezado y falta más de una semana
                return false;
            }

            if (nextEpisodeDate && nextEpisodeDate > oneWeekLater) {
                // Si el próximo episodio es dentro de más de una semana, tampoco
                return false;
            }

            // Si ha empezado ya o empieza muy pronto, sí la mostramos
            return true;
        });

        return filteredSeries.sort((a, b) => {
            // Primero por valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Luego por popularidad
            if (b.popularity !== a.popularity) {
                return b.popularity - a.popularity;
            }
            // Luego por fecha de primer episodio
            const dateA = new Date(a.first_air_date || "");
            const dateB = new Date(b.first_air_date || "");
            return dateB.getTime() - dateA.getTime();
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

// Series más populares
export const getMostPopularSeries = async ({page}: { page?: string }): Promise<Serie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Ordenar las series de más popular a menos popular
        return series.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las series populares:", error);
        return [];
    }
};

// Series mejor valoradas
export const getTopRatedSeries = async ({ page }: { page?: string }): Promise<Serie[]> => {
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/tv/top_rated?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        const filteredSeries = series.filter((serie) => {
            // Nos aseguramos que tengan un número de votos decente
            return (serie.vote_count ?? 0) >= 50;
        });

        return filteredSeries.sort((a, b) => {
            // Primero por mejor valoración
            if (b.vote_average !== a.vote_average) {
                return b.vote_average - a.vote_average;
            }
            // Si empate en nota, ordenar por popularidad
            return b.popularity - a.popularity;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series mejor valoradas:", error);
        return [];
    }
};


// Obtener serie por ID y sus plataformas de visualización
export const getSeriesById = async ({id}: { id: string }) => {
    const movieRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
    const providersRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${API_KEY}`);

    const movie = await movieRes.json() as Serie;
    const providers = await providersRes.json();

    // Añadir la información de las plataformas de visualización a la serie
    movie.providers = providers.results?.ES?.flatrate?.map((provider: any) => ({
        provider_id: provider.provider_id,
        provider_name: provider.provider_name,
        logo_path: provider.logo_path,
    })) || [];

    return movie;
};

// --- Configuración ---

const genreMap: Record<string, number | "on_the_air" | "horror"> = {
    accion: 10759,
    aventura: 10759,
    animacion: 16,
    comedia: 35,
    crimen: 80,
    documental: 99,
    drama: 18,
    familia: 10751,
    infantil: 10762,
    misterio: 9648,
    noticias: 10763,
    reality: 10764,
    ciencia_ficcion: 10765,
    fantasia: 10765,
    romance: 10749,
    telenovela: 10766,
    talkshow: 10767,
    terror: "horror", // Especial, ya que TMDB no tiene un género "terror" específico para TV
    guerra_politica: 10768,
    western: 37,
    proximamente: "on_the_air",
};

// --- Funciones auxiliares ---

const buildDiscoverTvUrl = (genreId: number, page: string) =>
    `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=${page}`;

const buildOnTheAirUrl = (page: string) =>
    `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${page}`;

const buildHorrorSearchUrl = (page: string) =>
    `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-ES&query=horror&page=${page}`;

const sortByExpectation = (a: Serie, b: Serie) => {
    if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
    }
    return b.vote_average - a.vote_average;
};

// --- Función principal ---

export const getSeriesByCategory = async (category: string, page: string = "1"): Promise<Serie[]> => {
    const normalizedCategory = category.trim().toLowerCase();
    const genreOrType = genreMap[normalizedCategory];

    if (!genreOrType) {
        throw new Error(`Categoría no válida: ${category}`);
    }

    let url: string;

    if (genreOrType === "on_the_air") {
        url = buildOnTheAirUrl(page);
    } else if (genreOrType === "horror") {
        url = buildHorrorSearchUrl(page);
    } else {
        url = buildDiscoverTvUrl(genreOrType, page);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Para "proximamente" (on_the_air), podrías filtrar por fecha si quieres, pero normalmente TMDB ya da las que están en emisión
        return series.sort(sortByExpectation);

    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

// Interfaz para el tipo de datos del reparto
interface CastMember {
    name: string;
    character: string;
    id: number;
}

// Función para obtener el reparto completo de todas las temporadas
export const getSeriesCast = async (tvId: string): Promise<CastMember[]> => {
    const seriesUrl = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=es-ES`;
    const seriesResponse = await fetch(seriesUrl);
    const seriesData = await seriesResponse.json();

    const totalSeasons = seriesData.number_of_seasons;
    const allCast = new Map<number, CastMember>();

    for (let season = 1; season <= totalSeasons; season++) {
        const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${season}/credits?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();

        data.cast?.forEach((actor: any) => {
            if (!allCast.has(actor.id)) {
                allCast.set(actor.id, {
                    name: actor.name,
                    character: actor.character,
                    id: actor.id
                });
            }
        });
    }

    return Array.from(allCast.values());
};


export const getSeriesDirectorsAndRoles = async (tvId: string): Promise<{ name: string, job: string }[]> => {
    const url = `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${API_KEY}&language=es-ES`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        const relevantRoles = ["Producer", "Executive Producer", "Visual Effects", "Original Music Composer"];

        return data.crew
            .filter((member: any) => relevantRoles.includes(member.job))
            .map((director: any) => ({name: director.name, job: director.job}))
    } catch (error) {
        console.error("Hubo un error al obtener los datos de los directores y roles:", error);
        return [];
    }
};

export const getSeriesByTitle = async ({title, page}: { title: string, page?: string }): Promise<Serie[]> => {
    // Si no se pasa un valor para 'page', establecer 1 como valor por defecto
    const pageNumber = page || "1";

    const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${title}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const series: Serie[] = Array.isArray(data.results) ? data.results : [];

        // Devolver el array de series ordenadas solo por popularidad
        return series.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
        console.error("Hubo un error al obtener las series:", error);
        return [];
    }
};

export const getSeriesTrailer = async (seriesId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/tv/${seriesId}/videos?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const trailer = data.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');

        // Si se encuentra el trailer, devolver el enlace al video en YouTube
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (error) {
        console.error("Hubo un error al obtener el trailer:", error);
        return null;
    }
};

export const getSeriesStatus = async (seriesId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const status = data.status; // Obtiene el estado de la serie (ej. 'Returning Series', 'Ended', 'Canceled')

        // Devolver el estado de la serie
        return status || null;
    } catch (error) {
        console.error("Hubo un error al obtener el estado de la serie:", error);
        return null;
    }
};

// Modifica tu función getEpisodesBySeasonNumber para mostrar más detalles
export async function getEpisodesBySeasonNumber(serieId: number | string, seasonNumber: number): Promise<any[]> {
    try {
        const url = `https://api.themoviedb.org/3/tv/${serieId}/season/${seasonNumber}?api_key=${API_KEY}&language=es-ES`;

        console.log(`Intentando acceder a: ${url.replace(API_KEY, "API_KEY_HIDDEN")}`);

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error de API: ${response.status} - ${errorText}`);
            throw new Error(`Error obteniendo episodios: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Datos obtenidos para temporada ${seasonNumber}, episodios: ${data.episodes?.length || 0}`);

        return data.episodes || [];
    } catch (error) {
        console.error("Error en getEpisodesBySeasonNumber:", error);
        return [];
    }
}

// Tipos para mejor organización
type SortOption = 'popularity' | 'vote_average' | 'first_air_date' | 'name';
type SortOrder = 'asc' | 'desc';

// Función mejorada para obtener y ordenar series
const fetchSeriesByProvider = async (
    providerId: number,
    page: string = "1",
    sortBy: SortOption = 'popularity',
    sortOrder: SortOrder = 'desc'
): Promise<Serie[]> => {
    // Mapeo para parámetros de ordenación de TMDb
    const sortMapping = {
        popularity: 'popularity',
        vote_average: 'vote_average',
        first_air_date: 'first_air_date',
        name: 'original_name'
    };

    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=${sortMapping[sortBy]}.${sortOrder}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
        console.error(`Hubo un error al obtener series del proveedor ${providerId}:`, error);
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
export const getNetflixSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.NETFLIX, page, sortBy, sortOrder);

export const getAmazonPrimeSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.AMAZON, page, sortBy, sortOrder);

export const getDisneyPlusSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.DISNEY, page, sortBy, sortOrder);

export const getHBOMaxSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.HBO, page, sortBy, sortOrder);

export const getAppleTVSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.APPLE, page, sortBy, sortOrder);

export const getMovistarPlusSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.MOVISTAR, page, sortBy, sortOrder);

export const getFilminSeries = async (page?: string, sortBy?: SortOption, sortOrder?: SortOrder) =>
    fetchSeriesByProvider(PROVIDERS.FILMIN, page, sortBy, sortOrder);

// Interfaz para la respuesta original de TMDB
interface TMDBPosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

// Interfaz para nuestra respuesta procesada
export interface PosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string; // Esta ya incluye la URL base
    vote_average: number;
    vote_count: number;
    width: number;
}

/**
 * Función para obtener todos los pósters de una serie específica
 * @param serieId ID de la serie en TMDB (puede ser string o number)
 * @param language Código de idioma para filtrar pósters (opcional)
 * @returns Array con los pósters de la serie
 */
export const fetchAllSeriesPosters = async (
    serieId: string | number,
    language: string = "es-ES"
): Promise<PosterImage[]> => {
    const numericId = typeof serieId === 'string' ? parseInt(serieId, 10) : serieId;
    const baseUrl = `https://api.themoviedb.org/3`;
    const fullImagePath = (path: string) => `https://image.tmdb.org/t/p/original${path}`;

    try {
        // Obtener datos de la serie (para conocer las temporadas)
        const seriesRes = await fetch(`${baseUrl}/tv/${numericId}?api_key=${API_KEY}`);
        const seriesData = await seriesRes.json();
        const seasons = seriesData.seasons || [];

        // Obtener pósters generales de la serie
        const seriesImagesRes = await fetch(`${baseUrl}/tv/${numericId}/images?api_key=${API_KEY}`);
        const seriesImagesData = await seriesImagesRes.json();
        let posters: TMDBPosterImage[] = seriesImagesData.posters || [];

        // Obtener pósters de cada temporada (incluyendo especiales - temporada 0)
        for (const season of seasons) {
            const seasonNumber = season.season_number;
            const seasonImagesRes = await fetch(`${baseUrl}/tv/${numericId}/season/${seasonNumber}/images?api_key=${API_KEY}`);
            const seasonImagesData = await seasonImagesRes.json();

            if (Array.isArray(seasonImagesData.posters)) {
                posters = posters.concat(seasonImagesData.posters);
            }
        }

        // Filtrar por idioma si se ha indicado uno específico
        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        // Formatear con ruta completa
        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path)
        }));

    } catch (error) {
        console.error(`Error al obtener los pósters de la serie ${numericId}:`, error);
        return [];
    }
};