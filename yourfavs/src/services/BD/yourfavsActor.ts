import {initializeApp} from "firebase/app";
import {getFirestore, collection, getDocs, query, orderBy, updateDoc, doc, deleteDoc} from "firebase/firestore";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

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
