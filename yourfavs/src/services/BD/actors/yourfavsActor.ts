import {collection, getDocs, query, orderBy, updateDoc, doc, deleteDoc, getDoc, setDoc} from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

interface ActorsFavs {
    id: string;
    position: number;
    added_at?: Date | string;
}

export type {ActorsFavs};

// Gestionar acciones POST de actores favoritos (add, remove, update position)
export async function handleActorFavAction(formData: FormData): Promise<string> {
    const actorId = String(formData.get('actor_id'));
    const action = String(formData.get('action'));
    const customPosition = formData.get('custom_position') ? Number(formData.get('custom_position')) : null;

    const docRef = doc(db, 'ActorsFavs', actorId);
    const docSnap = await getDoc(docRef);
    const actorExiste = docSnap.exists();

    if (action === 'add' && !actorExiste) {
        const actorsFavsRef = collection(db, 'ActorsFavs');
        const favsQuery = query(actorsFavsRef, orderBy('position'));
        const favsSnapshot = await getDocs(favsQuery);
        const currentFavorites: ActorsFavs[] = [];
        favsSnapshot.forEach((d) => {
            currentFavorites.push({id: d.id, ...d.data()} as ActorsFavs);
        });

        let newPosition: number;
        if (customPosition !== null) {
            const actorsToUpdate = currentFavorites.filter(fav => fav.position >= customPosition);
            for (const fav of actorsToUpdate.sort((a, b) => b.position - a.position)) {
                await updateDoc(doc(db, 'ActorsFavs', fav.id), { position: fav.position + 1 });
            }
            newPosition = customPosition;
        } else {
            newPosition = currentFavorites.length > 0
                ? Math.max(...currentFavorites.map(f => f.position || 0)) + 1
                : 1;
        }

        await setDoc(docRef, {
            id: actorId,
            added_at: new Date(),
            position: newPosition,
        });

    } else if (action === 'remove' && actorExiste) {
        await deleteDoc(docRef);

        const actorsFavsRef = collection(db, 'ActorsFavs');
        const favsQuery = query(actorsFavsRef, orderBy('position'));
        const favsSnapshot = await getDocs(favsQuery);
        const remainingFavorites: ActorsFavs[] = [];
        favsSnapshot.forEach((d) => {
            remainingFavorites.push({id: d.id, ...d.data()} as ActorsFavs);
        });

        for (let i = 0; i < remainingFavorites.length; i++) {
            await updateDoc(doc(db, 'ActorsFavs', remainingFavorites[i].id), { position: i + 1 });
        }

    } else if (action === 'update' && actorExiste) {
        const requestedPosition = customPosition !== null ? customPosition : Number(formData.get('custom_position'));

        if (!requestedPosition || Number.isNaN(requestedPosition)) {
            throw new Error('Nueva posición inválida');
        }

        const actorsFavsRef = collection(db, 'ActorsFavs');
        const favsQuery = query(actorsFavsRef, orderBy('position'));
        const favsSnapshot = await getDocs(favsQuery);
        const favorites: ActorsFavs[] = [];
        favsSnapshot.forEach((d) => {
            favorites.push({id: d.id, ...d.data()} as ActorsFavs);
        });

        if (favorites.length === 0) throw new Error('No hay actores en favoritos');

        const actorIndex = favorites.findIndex(fav => fav.id === actorId);
        if (actorIndex === -1) throw new Error('Actor no encontrado en favoritos');

        const currentPos = favorites[actorIndex].position;

        if (requestedPosition < 1 || requestedPosition > favorites.length) {
            throw new Error(`Posición debe estar entre 1 y ${favorites.length}`);
        }

        if (currentPos !== requestedPosition) {
            if (requestedPosition < currentPos) {
                for (const fav of favorites) {
                    if (fav.position >= requestedPosition && fav.position < currentPos) {
                        await updateDoc(doc(db, 'ActorsFavs', fav.id), { position: fav.position + 1 });
                    }
                }
            } else {
                for (const fav of favorites) {
                    if (fav.position > currentPos && fav.position <= requestedPosition) {
                        await updateDoc(doc(db, 'ActorsFavs', fav.id), { position: fav.position - 1 });
                    }
                }
            }
            await updateDoc(doc(db, 'ActorsFavs', actorId), { position: requestedPosition });
        }
    }

    return `/actor/${actorId}`;
}

export const getActorsFav = async (): Promise<ActorsFavs[]> => {
    try {
        const actorsFavsRef = collection(db, "ActorsFavs");
        const q = query(actorsFavsRef, orderBy("position"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return [];

        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActorsFavs));
    } catch (error) {
        console.error("Error al obtener los actores favoritos:", error);
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
