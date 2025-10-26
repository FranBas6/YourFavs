import {collection, getDocs, query, orderBy, updateDoc, doc, deleteDoc} from "firebase/firestore";
import { db } from "../../utils/firebaseConfig";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

interface ActorsFavs {
    id: string;
    position: number;
    added_at?: Date | string;
}

export type {ActorsFavs};

// Función para obtener actores favoritos ordenados por posición
export const getActorsFav = async (): Promise<ActorsFavs[]> => {
    try {
        console.log("Intentando obtener actores favoritos...");

        // Crear una referencia a la colección
        const actorsFavsRef = collection(db, "ActorsFavs");

        // Consultar ordenando por position
        const q = query(actorsFavsRef, orderBy("position"));
        const querySnapshot = await getDocs(q);

        // Procesar los resultados
        const result: ActorsFavs[] = [];
        querySnapshot.forEach((doc) => {
            // Añadir el ID del documento y todos los datos
            result.push({
                id: doc.id,
                ...doc.data()
            } as ActorsFavs);
        });

        console.log("Resultado de la consulta:", result);

        if (result.length === 0) {
            console.warn("No se encontraron actores favoritos.");
            return [];
        }

        return result;
    } catch (error) {
        console.error("Error al obtener los actores favoritos:", error);
        console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return [];
    }
};

// Función para actualizar la posición de un actor en favoritos
export const updateActorPosition = async (actorId: string, newPosition: number): Promise<void> => {
    try {
        const actorRef = doc(db, "ActorsFavs", actorId);
        await updateDoc(actorRef, {
            position: newPosition
        });
        console.log(`Posición del actor ${actorId} actualizada a ${newPosition}`);
    } catch (error) {
        console.error("Error al actualizar la posición del actor:", error);
        throw error;
    }
};

// Función para eliminar un actor de favoritos
export const removeActorFromFavorites = async (actorId: string): Promise<void> => {
    try {
        const actorRef = doc(db, "ActorsFavs", actorId);
        await deleteDoc(actorRef);
        console.log(`Actor ${actorId} eliminado de favoritos`);
    } catch (error) {
        console.error("Error al eliminar el actor de favoritos:", error);
        throw error;
    }
};
