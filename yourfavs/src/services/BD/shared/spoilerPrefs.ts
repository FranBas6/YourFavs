/**
 * Override por serie del "modo sin spoilers" (§2 · parada 2).
 *
 * Tabla `spoiler_prefs` (antes users/{uid}/SpoilerPrefs/tv_{id}) → spoiler_free. La SERIE manda
 * sobre el ajuste global del perfil: si hay override, se usa; si no, se sigue el global.
 * Una fila por serie, igual que `notification_subs`/`media_tags`.
 */
import { db, getAuthId, requireAuthId } from './userScope';

/** Override de la serie: `true`/`false` explícito, o `null` = seguir el global del perfil. */
export async function getSpoilerPref(serieId: string | number): Promise<boolean | null> {
    const userId = getAuthId();
    if (!userId) return null;
    try {
        const { data, error } = await db().from('spoiler_prefs').select('spoiler_free')
            .eq('user_id', userId).eq('tmdb_id', Number(serieId)).maybeSingle();
        if (error || !data) return null;
        return typeof data.spoiler_free === 'boolean' ? data.spoiler_free : null;
    } catch {
        return null;
    }
}

/**
 * Borra el override para que la serie vuelva a seguir el ajuste global.
 *
 * Hace falta porque un `false` explícito es indistinguible, de cara al usuario, de "no tengo
 * override": la serie se quedaba ignorando el global para siempre y sin forma de deshacerlo.
 */
export async function clearSpoilerPref(serieId: string | number): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    try {
        await db().from('spoiler_prefs').delete().eq('user_id', userId).eq('tmdb_id', Number(serieId));
    } catch { /* si no existe, ya está en el estado que queremos */ }
}

export async function setSpoilerPref(serieId: string | number, value: boolean): Promise<void> {
    const { error } = await db().from('spoiler_prefs').upsert(
        { user_id: requireAuthId(), tmdb_id: Number(serieId), spoiler_free: value },
        { onConflict: 'user_id,tmdb_id' },
    );
    if (error) throw new Error(error.message);
}
