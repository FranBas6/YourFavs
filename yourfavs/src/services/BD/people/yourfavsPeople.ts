import { db, fetchAll, getAuthId, requireAuthId } from "../shared/userScope";

/**
 * Personas seguidas (handoff v2 §③ "Avísame de estrenos"): actores/directores
 * cuyos estrenos futuros se anuncian en el calendario. Se guarda nombre y foto
 * para pintar sin re-fetch de /person/{id} (la ficha ya los tiene al seguir).
 *
 * Tabla `followed_people` (antes users/{uid}/FollowedPeople).
 */
export interface FollowedPerson {
    id: string;            // id TMDB de la persona
    name: string;
    profile_path: string | null;
    added_at: Date;
}

interface PersonRow { person_id: number; name: string | null; profile_path: string | null; added_at: string }

const toPerson = (r: PersonRow): FollowedPerson => ({
    id: String(r.person_id),
    name: r.name ?? '',
    profile_path: r.profile_path ?? null,
    added_at: new Date(r.added_at),
});

export async function addFollowedPerson(id: string, name: string, profilePath: string | null): Promise<void> {
    const { error } = await db().from('followed_people').upsert(
        { user_id: requireAuthId(), person_id: Number(id), name, profile_path: profilePath ?? null, added_at: new Date().toISOString() },
        { onConflict: 'user_id,person_id' },
    );
    if (error) throw new Error(error.message);
}

export async function removeFollowedPerson(id: string): Promise<void> {
    // Borrado que devuelve la fila: nombre/foto quedan para la bitácora (§5), que así puede
    // pintar el avatar sin re-fetch a TMDB (igual que el evento de "empezaste a seguir").
    const { data, error } = await db().from('followed_people').delete()
        .eq('user_id', requireAuthId()).eq('person_id', Number(id)).select('name, profile_path');
    if (error) throw new Error(error.message);
    const d = data?.[0];
    const meta: Record<string, unknown> = d ? { name: d.name, profile_path: d.profile_path ?? null } : {};
    // §5 · bitácora (best-effort): dejar de seguir es intencional y borra el added_at.
    try {
        const { appendActivity } = await import('../shared/activityLog');
        await appendActivity({ verb: 'unfollow', media_type: 'person', tmdb_id: id, meta });
    } catch { /* bitácora opcional */ }
}

export async function getFollowedPerson(id: string): Promise<FollowedPerson | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('followed_people').select('person_id, name, profile_path, added_at')
        .eq('user_id', userId).eq('person_id', Number(id)).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toPerson(data as PersonRow) : null;
}

export async function getAllFollowedPeople(): Promise<FollowedPerson[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<PersonRow>((from, to) =>
        db().from('followed_people').select('person_id, name, profile_path, added_at').eq('user_id', userId)
            .order('added_at').order('person_id').range(from, to),
    );
    return rows.map(toPerson);
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
