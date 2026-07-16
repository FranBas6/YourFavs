/**
 * Override por serie del "modo sin spoilers" (§2 · parada 2).
 *
 * Doc `users/{uid}/SpoilerPrefs/tv_{id}` → { spoilerFree: boolean }. La SERIE manda
 * sobre el ajuste global del perfil: si hay override, se usa; si no, se sigue el global.
 * Mismo patrón de doc-id por título que `NotificationSubs`/`MediaTags`.
 */
import { userDoc, getCurrentUid } from './userScope';

const COLLECTION = 'SpoilerPrefs';

/** Override de la serie: `true`/`false` explícito, o `null` = seguir el global del perfil. */
export async function getSpoilerPref(serieId: string | number): Promise<boolean | null> {
    if (!getCurrentUid()) return null;
    try {
        const snap = await userDoc(COLLECTION, `tv_${serieId}`).get();
        if (!snap.exists) return null;
        const v = (snap.data() as any)?.spoilerFree;
        return typeof v === 'boolean' ? v : null;
    } catch {
        return null;
    }
}

export async function setSpoilerPref(serieId: string | number, value: boolean): Promise<void> {
    await userDoc(COLLECTION, `tv_${serieId}`).set({
        id: `tv_${serieId}`,
        tmdb_id: String(serieId),
        spoilerFree: value,
        updated_at: new Date(),
    });
}
