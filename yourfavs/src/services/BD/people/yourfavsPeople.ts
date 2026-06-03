import { collection, getDocs, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

const COLLECTION = 'FollowedPeople';

/**
 * Personas seguidas (handoff v2 §③ "Avísame de estrenos"): actores/directores
 * cuyos estrenos futuros se anuncian en el calendario. Se guarda nombre y foto
 * para pintar sin re-fetch de /person/{id} (la ficha ya los tiene al seguir).
 */
export interface FollowedPerson {
    id: string;            // id TMDB de la persona
    name: string;
    profile_path: string | null;
    added_at: Date;
}

export async function addFollowedPerson(id: string, name: string, profilePath: string | null): Promise<void> {
    await setDoc(doc(db, COLLECTION, id), {
        id,
        name,
        profile_path: profilePath ?? null,
        added_at: new Date(),
    });
}

export async function removeFollowedPerson(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
}

export async function getFollowedPerson(id: string): Promise<FollowedPerson | null> {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? (snap.data() as FollowedPerson) : null;
}

export async function getAllFollowedPeople(): Promise<FollowedPerson[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(d => d.data() as FollowedPerson);
}

/** Form POST de la ficha (actionType=follow_person, action=add|remove). */
export async function handlePersonFollowAction(formData: FormData): Promise<void> {
    const personId = String(formData.get('person_id') || '');
    const action = String(formData.get('action') || '');
    if (!personId) return;
    if (action === 'add') {
        await addFollowedPerson(
            personId,
            String(formData.get('name') || ''),
            (formData.get('profile_path') as string) || null,
        );
    } else if (action === 'remove') {
        await removeFollowedPerson(personId);
    }
}
