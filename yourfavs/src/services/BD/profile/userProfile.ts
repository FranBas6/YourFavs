/**
 * Perfil + preferencias del usuario (Fase E).
 *
 * Vive en el documento RAÍZ users/{uid} (campos), separado de las subcolecciones
 * de listas. Antes ese doc "no existía" (solo subcolecciones); aquí le damos
 * campos. Acceso por Admin SDK vía userScope (uid de la sesión).
 */
import { userRootDoc, getCurrentUid } from '../shared/userScope';

export interface UserProfile {
    display_name?: string;
    avatar_url?: string | null;
    region?: string;            // código país, p.ej. 'ES' (SUPPORTED_COUNTRIES)
    language?: string;          // p.ej. 'es-ES'
    theme?: 'light' | 'dark' | 'system';
    email?: string;             // espejo del email (informativo)
    onboarding?: 'done' | 'skipped';  // estado del onboarding de gustos (Fase F)
    platforms?: number[];       // provider_ids TMDB de "mis plataformas" (Auditoría v2 · 3.2)
    /** Toggles de la campana por tipo (Bloque 4). Ausente = todo activado. */
    notifPrefs?: { episodes?: boolean; releases?: boolean; anniversary?: boolean; platform?: boolean; streak?: boolean };
    spoilerFree?: boolean;   // §2 modo sin spoilers (OFF por defecto; solo true lo activa)
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
