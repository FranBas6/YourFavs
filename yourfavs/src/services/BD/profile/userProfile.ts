/**
 * Perfil + preferencias del usuario (Fase E).
 *
 * Vive en el documento RAÍZ users/{uid} (campos), separado de las subcolecciones
 * de listas. Antes ese doc "no existía" (solo subcolecciones); aquí le damos
 * campos. Acceso por Admin SDK vía userScope (uid de la sesión).
 */
import { userRootDoc, getCurrentUid } from '../shared/userScope';

/**
 * Modo sin spoilers, desglosado.
 *
 * `enabled` es el maestro; los `hide*` dicen QUÉ se tapa cuando está encendido. Se llaman
 * `hide*` a propósito: un campo `episodeStills: true` se lee como "muestra los fotogramas",
 * que es justo lo contrario de lo que hace.
 *
 * El override por serie (`users/{uid}/SpoilerPrefs/tv_{id}`) sigue siendo un booleano y actúa
 * solo sobre `enabled`: la serie decide SI el modo está activo, y el desglose es global.
 */
export interface SpoilerSettings {
    enabled: boolean;
    /** Difumina el fotograma de los episodios no vistos. */
    hideStills: boolean;
    /** Difumina la sinopsis (y las estrellas invitadas) de los episodios no vistos. */
    hideSynopsis: boolean;
    /** En el calendario y el .ics, deja "T2 · E5" sin el nombre del episodio. */
    hideCalendarTitles: boolean;
}

/**
 * Ajustes efectivos a partir del perfil, con retrocompatibilidad: quien solo tenga el booleano
 * viejo `spoilerFree` sigue viendo EXACTAMENTE lo que veía — fotograma y sinopsis tapados, y el
 * calendario intacto (que es lo que hacía antes). De ahí que `hideCalendarTitles` sea `false`
 * por defecto y los otros dos `true`.
 */
export function resolveSpoilerSettings(
    profile: Pick<UserProfile, 'spoilerFree' | 'spoilers'> | null | undefined,
): SpoilerSettings {
    const s = profile?.spoilers;
    return {
        enabled: s?.enabled ?? profile?.spoilerFree === true,
        hideStills: s?.hideStills ?? true,
        hideSynopsis: s?.hideSynopsis ?? true,
        hideCalendarTitles: s?.hideCalendarTitles ?? false,
    };
}

export interface UserProfile {
    display_name?: string;
    avatar_url?: string | null;
    region?: string;            // código país, p.ej. 'ES' (SUPPORTED_COUNTRIES)
    language?: string;          // p.ej. 'es-ES'
    theme?: 'light' | 'dark' | 'system';
    email?: string;             // espejo del email (informativo)
    onboarding?: 'done' | 'skipped';  // estado del onboarding de gustos (Fase F)
    platforms?: number[];       // provider_ids TMDB de "mis plataformas" (Auditoría v2 · 3.2)
    /** Catálogo y ruleta arrancan ya filtrados a `platforms` (Ajustes · A3). */
    platformsFilterDefault?: boolean;
    /** Toggles de la campana por tipo (Bloque 4). Ausente = todo activado. */
    notifPrefs?: { episodes?: boolean; releases?: boolean; anniversary?: boolean; platform?: boolean; streak?: boolean };
    /**
     * §2 modo sin spoilers, versión original: un único booleano que tapaba fotograma + sinopsis
     * juntos. **Ya no se escribe**; se conserva solo para LEER perfiles que nunca han vuelto a
     * tocar el ajuste. La fuente de verdad es `spoilers`.
     */
    spoilerFree?: boolean;
    /** Modo sin spoilers desglosado (Ajustes · A3b). Ver `resolveSpoilerSettings`. */
    spoilers?: Partial<SpoilerSettings>;
    homeLayout?: { key: string; hidden?: boolean }[];   // §4 home a tu medida (mostrar/ocultar bloques)
    updated_at?: unknown;
}

export async function getUserProfile(): Promise<UserProfile | null> {
    if (!getCurrentUid()) return null;
    const snap = await userRootDoc().get();
    return snap.exists ? (snap.data() as UserProfile) : null;
}

/** Merge parcial: solo escribe los campos presentes en `patch`. */
export async function setUserProfile(patch: Partial<UserProfile>): Promise<void> {
    await userRootDoc().set({ ...patch, updated_at: new Date() }, { merge: true });
}
