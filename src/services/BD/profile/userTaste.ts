/**
 * Gustos del usuario (Fase F · onboarding) — almacén `taste` propio.
 *
 * Vive en `user_state` con clave 'taste' (antes users/{uid}/taste/current), SEPARADO de las listas
 * (Favoritos / Me gusta / …) y también del doc raíz de perfil. Razón: "lo que
 * sigo" ≠ "lo que le digo al sistema que me gusta"; y al ser arrays grandes
 * (hasta 10 géneros + 10 títulos + 10 personas) no deben engordar la lectura
 * de perfil que hace el middleware en CADA request.
 *
 * El estado del onboarding ('done' | 'skipped') NO vive aquí: es una bandera
 * ligera en el doc raíz de perfil (userProfile.ts) para decidir gating sin
 * lecturas extra.
 *
 * Al borrar la cuenta, el `on delete cascade` de `user_state` se lo lleva → sin pasos extra.
 */
import { db, getAuthId, requireAuthId } from '../shared/userScope';

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

const KEY = 'taste';

export async function getUserTaste(): Promise<UserTaste | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('user_state').select('data').eq('user_id', userId).eq('key', KEY).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.data as unknown as UserTaste) : null;
}

/** Merge parcial: solo escribe los campos presentes en `patch` (el resto se conserva). */
export async function setUserTaste(patch: Partial<UserTaste>): Promise<void> {
    const userId = requireAuthId();
    const current = await getUserTaste();
    const next = { ...(current ?? {}), ...patch, updated_at: new Date().toISOString() };
    const { error } = await db().from('user_state').upsert(
        { user_id: userId, key: KEY, data: next as never },
        { onConflict: 'user_id,key' },
    );
    if (error) throw new Error(error.message);
}

/** Reinicia los gustos (borra la fila). El estado de onboarding se gestiona aparte. */
export async function clearUserTaste(): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    const { error } = await db().from('user_state').delete().eq('user_id', userId).eq('key', KEY);
    if (error) throw new Error(error.message);
}
