/**
 * Perfil + preferencias del usuario (Fase E).
 *
 * Vive en la tabla `profiles` (antes el documento RAÍZ users/{uid}), una fila por cuenta que
 * crea el trigger `on_auth_user_created`. Hacia fuera se mantiene la forma de siempre en
 * camelCase (`platformsFilterDefault`, `notifPrefs`…); las columnas van en snake_case.
 */
import { db, getAuthId, requireAuthId } from '../shared/userScope';

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

/** Paletas de la tira de episodios (9.4). El orden es el de Ajustes. */
export const STRIP_PALETTES = ['azul', 'verde', 'semaforo', 'grisverde', 'verde987', 'contorno'] as const;
export type StripPalette = (typeof STRIP_PALETTES)[number];

export interface UserProfile {
    display_name?: string;
    avatar_url?: string | null;
    region?: string;            // código país, p.ej. 'ES' (SUPPORTED_COUNTRIES)
    language?: string;          // p.ej. 'es-ES'
    theme?: 'light' | 'dark' | 'system';
    /** Paleta de la tira de episodios (Ajustes → Apariencia, 9.4). Sin valor = azul. */
    stripPalette?: StripPalette;
    email?: string;             // espejo del email (informativo)
    onboarding?: 'done' | 'skipped';  // estado del onboarding de gustos (Fase F)
    platforms?: number[];       // provider_ids TMDB de "mis plataformas" (Auditoría v2 · 3.2)
    /** Catálogo y ruleta arrancan ya filtrados a `platforms` (Ajustes · A3). */
    platformsFilterDefault?: boolean;
    /** Mensajes M5c: «Incluir mis planes» en tu calendario .ics (por defecto, sí). */
    icsPlans?: boolean;
    /** Toggles de la campana por tipo (Bloque 4). Ausente = todo activado. */
    /** `social`: avisos entre personas (alguien te sigue…); los respeta la BD al crearlos. */
    notifPrefs?: { episodes?: boolean; releases?: boolean; anniversary?: boolean; platform?: boolean; streak?: boolean; social?: boolean };
    /**
     * §2 modo sin spoilers, versión original: un único booleano que tapaba fotograma + sinopsis
     * juntos. **Ya no se escribe**; se conserva solo para LEER perfiles que nunca han vuelto a
     * tocar el ajuste. La fuente de verdad es `spoilers`.
     */
    spoilerFree?: boolean;
    /** Modo sin spoilers desglosado (Ajustes · A3b). Ver `resolveSpoilerSettings`. */
    spoilers?: Partial<SpoilerSettings>;
    homeLayout?: { key: string; hidden?: boolean }[];   // §4 home a tu medida (mostrar/ocultar bloques)
    /**
     * Perfil público (F1 social): SOLO LECTURA desde aquí. Se leen porque el middleware los pone
     * en `locals.user` para el menú de cuenta y la hoja Perfil («Ver mi perfil público»). Se
     * escriben con `services/BD/social/publicSettings.ts`, que valida el handle (formato,
     * reservados, unicidad, 30 días) y el resto de campos públicos.
     */
    publicHandle?: string;
    publicVisibility?: 'off' | 'public' | 'friends';
    /**
     * Mensajes M3: nombre secreto de tu canal de tiempo real (`u:{rtKey}`). SOLO LECTURA y solo para
     * ti: el middleware lo pasa a `SocialLayer`, que lo da a tu navegador. Nunca sale en nada público.
     */
    rtKey?: string;
    updated_at?: unknown;
}

/** Campo del perfil (camelCase, lo que ve la app) → columna de `profiles`. */
const COLUMN: Record<Exclude<keyof UserProfile, 'updated_at'>, string> = {
    display_name: 'display_name',
    avatar_url: 'avatar_url',
    region: 'region',
    language: 'language',
    theme: 'theme',
    stripPalette: 'strip_palette',
    email: 'email',
    onboarding: 'onboarding',
    platforms: 'platforms',
    platformsFilterDefault: 'platforms_filter_default',
    icsPlans: 'ics_plans',
    notifPrefs: 'notif_prefs',
    spoilerFree: 'spoiler_free',
    spoilers: 'spoilers',
    homeLayout: 'home_layout',
    publicHandle: 'public_handle',
    publicVisibility: 'public_visibility',
    rtKey: 'rt_key',
};
/** Campos que `setUserProfile` NUNCA escribe: tienen su propio módulo con validación. */
const READ_ONLY = new Set<string>(['publicHandle', 'publicVisibility', 'rtKey']);
const SELECT = [...Object.values(COLUMN), 'updated_at'].join(', ');

export async function getUserProfile(): Promise<UserProfile | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('profiles').select(SELECT).eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    // Sin claves a null: en Firestore un campo nunca escrito simplemente no existía, y así es
    // como lo leen las páginas (`profile?.theme ?? 'light'`).
    const row = data as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(COLUMN)) if (row[column] !== null) out[field] = row[column];
    if (row.updated_at) out.updated_at = row.updated_at;
    return out as UserProfile;
}

/**
 * Merge parcial: solo escribe los campos presentes en `patch`.
 *
 * Firestore (`set(..., { merge: true })`) fusionaba también DENTRO de los mapas, y Ajustes
 * depende de ello: manda solo el interruptor que cambió (`notifPrefs: { episodes: false }`)
 * sin borrar los demás. Un UPDATE de Postgres sustituiría el jsonb entero, así que esos dos
 * objetos se fusionan aquí con lo que ya hay. Los arrays (`platforms`, `homeLayout`) se
 * sustituyen, igual que hacía Firestore.
 */
export async function setUserProfile(patch: Partial<UserProfile>): Promise<void> {
    const userId = requireAuthId();
    const merged: Partial<UserProfile> = { ...patch };
    if (patch.notifPrefs || patch.spoilers) {
        const current = await getUserProfile();
        if (patch.notifPrefs) merged.notifPrefs = { ...(current?.notifPrefs ?? {}), ...patch.notifPrefs };
        if (patch.spoilers) merged.spoilers = { ...(current?.spoilers ?? {}), ...patch.spoilers };
    }
    const update: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(merged)) {
        const column = COLUMN[field as keyof typeof COLUMN];
        if (READ_ONLY.has(field)) continue;
        if (column && value !== undefined) update[column] = value; // updated_at: lo pone el trigger
    }
    if (!Object.keys(update).length) return;
    const { error } = await db().from('profiles').update(update as never).eq('id', userId);
    if (error) throw new Error(error.message);
}
