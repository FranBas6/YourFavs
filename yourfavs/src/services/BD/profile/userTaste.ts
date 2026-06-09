/**
 * Gustos del usuario (Fase F · onboarding) — almacén `taste` propio.
 *
 * Vive en la subcolección users/{uid}/taste/current, SEPARADO de las listas
 * (Favoritos / Me gusta / …) y también del doc raíz de perfil. Razón: "lo que
 * sigo" ≠ "lo que le digo al sistema que me gusta"; y al ser arrays grandes
 * (hasta 10 géneros + 10 títulos + 10 personas) no deben engordar la lectura
 * de perfil que hace el middleware en CADA request.
 *
 * El estado del onboarding ('done' | 'skipped') NO vive aquí: es una bandera
 * ligera en el doc raíz de perfil (userProfile.ts) para decidir gating sin
 * lecturas extra. Acceso por Admin SDK vía userScope (uid de la sesión).
 *
 * El borrado de cuenta usa recursiveDelete(users/{uid}), que ya cubre esta
 * subcolección automáticamente → sin pasos extra al eliminar cuenta.
 */
import { userRootDoc, getCurrentUid } from '../shared/userScope';
import type { DocumentReference } from 'firebase-admin/firestore';

export interface TasteTitle {
    id: number;
    media_type: 'movie' | 'tv';
    title: string;             // se guarda para el resumen del perfil (sin re-fetch TMDB)
    poster_path: string | null;
}

export interface TastePerson {
    id: number;
    name: string;
    profile_path: string | null;
}

export interface UserTaste {
    // Géneros elegidos en el onboarding, partidos por tipo (Fase F.7). Cada
    // género elegido aporta su ID de cine y, si existe, su equivalente de TV.
    movieGenres: number[];   // IDs de género de cine · ≥3
    tvGenres: number[];      // IDs de género de TV (subconjunto mapeado)
    /** @deprecated pre-F.7: lista única con IDs de cine. Se lee como fallback. */
    genres?: number[];
    titles: TasteTitle[];    // pelis + series (cada una con su media_type) · cada lista 0 ó ≥3 · máx 10
    people: TastePerson[];   // opcional · si entra, mín 3 · máx 10
    updated_at?: unknown;
}

/** Doc de gustos del usuario actual: users/{uid}/taste/current. Lanza sin sesión. */
function tasteDoc(): DocumentReference {
    return userRootDoc().collection('taste').doc('current');
}

export async function getUserTaste(): Promise<UserTaste | null> {
    if (!getCurrentUid()) return null;
    const snap = await tasteDoc().get();
    return snap.exists ? (snap.data() as UserTaste) : null;
}

/** Merge parcial: solo escribe los campos presentes en `patch`. */
export async function setUserTaste(patch: Partial<UserTaste>): Promise<void> {
    await tasteDoc().set({ ...patch, updated_at: new Date() }, { merge: true });
}

/** Reinicia los gustos (borra el doc). El estado de onboarding se gestiona aparte. */
export async function clearUserTaste(): Promise<void> {
    if (!getCurrentUid()) return;
    await tasteDoc().delete();
}
