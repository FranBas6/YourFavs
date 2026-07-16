import { userCol, userDoc, getCurrentUid } from "../shared/userScope";

const COLLECTION = 'FollowedPeople';

/**
 * Personas seguidas (handoff v2 §③ "Avísame de estrenos"): actores/directores
 * cuyos estrenos futuros se anuncian en el calendario. Se guarda nombre y foto
 * para pintar sin re-fetch de /person/{id} (la ficha ya los tiene al seguir).
 *
 * Fase C: datos por usuario (users/{uid}/FollowedPeople) vía Admin SDK + userScope.
 */
export interface FollowedPerson {
    id: string;            // id TMDB de la persona
    name: string;
    profile_path: string | null;
    added_at: Date;
}

export async function addFollowedPerson(id: string, name: string, profilePath: string | null): Promise<void> {
    await userDoc(COLLECTION, id).set({
        id,
        name,
        profile_path: profilePath ?? null,
        added_at: new Date(),
    });
}

export async function removeFollowedPerson(id: string): Promise<void> {
    const ref = userDoc(COLLECTION, id);
    // Capturamos nombre/foto ANTES de borrar, para que la bitácora (§5) pueda pintar
    // el avatar sin re-fetch a TMDB (igual que el evento de "empezaste a seguir").
    let meta: Record<string, unknown> = {};
    try {
        const snap = await ref.get();
        if (snap.exists) {
            const d = snap.data() as FollowedPerson;
            meta = { name: d.name, profile_path: d.profile_path ?? null };
        }
    } catch { /* metadatos opcionales */ }
    await ref.delete();
    // §5 · bitácora (best-effort): dejar de seguir es intencional y borra el added_at.
    try {
        const { appendActivity } = await import('../shared/activityLog');
        await appendActivity({ verb: 'unfollow', media_type: 'person', tmdb_id: id, meta });
    } catch { /* bitácora opcional */ }
}

export async function getFollowedPerson(id: string): Promise<FollowedPerson | null> {
    if (!getCurrentUid()) return null;
    const snap = await userDoc(COLLECTION, id).get();
    return snap.exists ? (snap.data() as FollowedPerson) : null;
}

export async function getAllFollowedPeople(): Promise<FollowedPerson[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).get();
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
