/**
 * Estado suelto por usuario en `user_state` (clave → jsonb): los documentos de forma libre que
 * en Firestore vivían sueltos (notifMeta/providerState, meta/notifSync) y que solo se leen y
 * escriben enteros. Las claves válidas las fija el CHECK de la tabla.
 */
import { db, getAuthId, requireAuthId } from './userScope';

export type UserStateKey = 'taste' | 'notif_provider_state' | 'notif_sync';

export async function readUserState<T>(key: UserStateKey): Promise<T | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('user_state').select('data').eq('user_id', userId).eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.data as unknown as T) : null;
}

/** Sustituye el documento entero (como el `set` sin merge de Firestore). */
export async function writeUserState(key: UserStateKey, value: object): Promise<void> {
    const { error } = await db().from('user_state').upsert(
        { user_id: requireAuthId(), key, data: value as never },
        { onConflict: 'user_id,key' },
    );
    if (error) throw new Error(error.message);
}
