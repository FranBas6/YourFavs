/**
 * Ajustes del perfil público del usuario EN SESIÓN (Ajustes → «Perfil público»).
 *
 * Todo va con el cliente de la petición (`db()`): la RLS solo deja tocar tu fila de `profiles`,
 * tus colecciones y tus títulos ocultos. La única consulta con la clave secreta es la de «¿lo tiene
 * otra cuenta?» del handle, en `handles.ts`.
 *
 * Valida en el servidor TODO lo que el cliente ya valida (handoff §9): un PATCH a mano no puede
 * saltarse el formato del handle, los 30 días, el tope de la bio o publicar sin dirección.
 */
import { db, requireAuthId } from '../shared/userScope';
import { checkHandle, type HandleProblem } from './handles';
import { resolvePublicSections, type PublicSectionPref } from '../../../utils/constants/publicSections';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export type PublicVisibility = 'off' | 'public' | 'friends';

export interface PublicPick {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    year: string | null;
}

export interface PublicArchetype {
    name: string;
    icon: string;
    description: string;
    computed_at: string;
}

export interface OwnPublicSettings {
    handle: string | null;
    handleChangedAt: string | null;
    visibility: PublicVisibility;
    since: string | null;
    bio: string;
    four: PublicPick[];
    sections: PublicSectionPref[];
    indexable: boolean;
    archetype: PublicArchetype | null;
}

export const BIO_MAX = 280;

/** Error con su código HTTP y un mensaje ya en español para el cliente. */
export class PublicSettingsError extends Error {
    constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
        super(message);
    }
}

const COLUMNS = 'public_handle, public_handle_changed_at, public_visibility, public_since, public_bio, public_four, public_sections, public_indexable, public_archetype';

/** Saneado de «Mis 4»: lo que llegue del cliente no se guarda tal cual. */
export function sanitizeFour(raw: unknown): PublicPick[] {
    if (!Array.isArray(raw)) throw new PublicSettingsError(400, 'four', 'Mis 4 no tiene un formato válido.');
    if (raw.length > 4) throw new PublicSettingsError(400, 'four', 'Solo caben 4 títulos.');
    const seen = new Set<string>();
    return raw.map((item) => {
        const it = (item ?? {}) as Record<string, unknown>;
        const media_type = it.media_type === 'movie' || it.media_type === 'tv' ? it.media_type : null;
        const tmdb_id = Number(it.tmdb_id);
        if (!media_type || !Number.isInteger(tmdb_id) || tmdb_id <= 0) {
            throw new PublicSettingsError(400, 'four', 'Uno de los títulos no es válido.');
        }
        const key = `${media_type}:${tmdb_id}`;
        if (seen.has(key)) throw new PublicSettingsError(400, 'four', 'Ese título ya está en tus 4.');
        seen.add(key);
        const title = typeof it.title === 'string' ? it.title.trim().slice(0, 200) : '';
        // Solo rutas de imagen de TMDB (`/abc123.jpg`): nada de URLs completas en el perfil público.
        const poster = typeof it.poster_path === 'string' && /^\/[\w.-]+$/.test(it.poster_path) ? it.poster_path : null;
        const yearRaw = typeof it.year === 'string' || typeof it.year === 'number' ? String(it.year) : '';
        const year = /^\d{4}$/.test(yearRaw) ? yearRaw : null;
        return { media_type, tmdb_id, title: title || 'Sin título', poster_path: poster, year };
    });
}

function parseFour(raw: unknown): PublicPick[] {
    try { return sanitizeFour(raw); } catch { return []; }
}

function rowToSettings(row: Record<string, unknown> | null): OwnPublicSettings {
    const r = row ?? {};
    const vis = r.public_visibility;
    return {
        handle: typeof r.public_handle === 'string' ? r.public_handle : null,
        handleChangedAt: typeof r.public_handle_changed_at === 'string' ? r.public_handle_changed_at : null,
        visibility: vis === 'public' || vis === 'friends' ? vis : 'off',
        since: typeof r.public_since === 'string' ? r.public_since : null,
        bio: typeof r.public_bio === 'string' ? r.public_bio : '',
        four: parseFour(r.public_four),
        sections: resolvePublicSections(r.public_sections),
        indexable: r.public_indexable === true,
        archetype: (r.public_archetype as PublicArchetype | null) ?? null,
    };
}

export async function getOwnPublicSettings(): Promise<OwnPublicSettings> {
    const userId = requireAuthId();
    const { data, error } = await db().from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return rowToSettings(data as Record<string, unknown> | null);
}

/** Comprobación en vivo del campo de handle (sin guardar). */
export async function checkOwnHandle(raw: unknown): Promise<
    { ok: true; handle: string; same: boolean } | { ok: false; handle: string; reason: HandleProblem; availableFrom?: string }
> {
    const userId = requireAuthId();
    const current = await getOwnPublicSettings();
    return checkHandle(raw, { id: userId, current: current.handle, changedAt: current.handleChangedAt });
}

export interface PublicSettingsPatch {
    handle?: unknown;
    visibility?: unknown;
    bio?: unknown;
    four?: unknown;
    sections?: unknown;
    indexable?: unknown;
}

/**
 * Guarda SOLO los campos enviados, como el resto de Ajustes. Devuelve los ajustes resultantes
 * para que el cliente se quede con lo que de verdad quedó guardado.
 */
export async function updatePublicSettings(patch: PublicSettingsPatch): Promise<OwnPublicSettings> {
    const userId = requireAuthId();
    const current = await getOwnPublicSettings();
    const update: Record<string, unknown> = {};

    let handleAfter = current.handle;
    if (patch.handle !== undefined) {
        const check = await checkHandle(patch.handle, { id: userId, current: current.handle, changedAt: current.handleChangedAt });
        if (!check.ok) {
            const status = check.reason === 'taken' ? 409 : check.reason === 'cooldown' ? 423 : 400;
            const msg = {
                format: 'Solo minúsculas, números y _, de 3 a 20 caracteres.',
                reserved: 'Esa dirección no está disponible.',
                taken: 'Esa dirección ya la tiene otra persona.',
                cooldown: 'Solo puedes cambiar tu dirección una vez cada 30 días.',
            }[check.reason];
            throw new PublicSettingsError(status, check.reason, msg, check.availableFrom ? { availableFrom: check.availableFrom } : {});
        }
        if (!check.same) {
            update.public_handle = check.handle;
            // El primero no cuenta para los 30 días: no había enlaces que romper.
            if (current.handle) update.public_handle_changed_at = new Date().toISOString();
            handleAfter = check.handle;
        }
    }

    if (patch.visibility !== undefined) {
        const v = patch.visibility;
        if (v !== 'off' && v !== 'public' && v !== 'friends') {
            throw new PublicSettingsError(400, 'visibility', 'Visibilidad no válida.');
        }
        if (v === 'friends' && !SOCIAL_PHASE.friends) {
            throw new PublicSettingsError(400, 'visibility', '«Solo amigos» llegará pronto.');
        }
        if (v !== 'off' && !handleAfter) {
            throw new PublicSettingsError(400, 'handle_required', 'Elige primero tu dirección.');
        }
        update.public_visibility = v;
        if (v !== 'off' && current.visibility === 'off') update.public_since = new Date().toISOString();
    }

    if (patch.bio !== undefined) {
        if (typeof patch.bio !== 'string') throw new PublicSettingsError(400, 'bio', 'La bio tiene que ser texto.');
        const bio = patch.bio.trim();
        if ([...bio].length > BIO_MAX) throw new PublicSettingsError(400, 'bio', `La bio no puede pasar de ${BIO_MAX} caracteres.`);
        update.public_bio = bio || null;
    }

    if (patch.four !== undefined) update.public_four = sanitizeFour(patch.four);

    if (patch.sections !== undefined) {
        // Acepta el array guardado ([{id,on}]) o el objeto de interruptores ({favs:true,…}) que
        // manda el autoguardado; en el segundo caso se respeta el orden que ya había.
        const raw = patch.sections;
        if (Array.isArray(raw)) {
            update.public_sections = resolvePublicSections(raw);
        } else if (raw && typeof raw === 'object') {
            const map = raw as Record<string, unknown>;
            update.public_sections = resolvePublicSections(
                current.sections.map((s) => ({ id: s.id, on: typeof map[s.id] === 'boolean' ? map[s.id] : s.on })),
            );
        } else {
            throw new PublicSettingsError(400, 'sections', 'Secciones no válidas.');
        }
    }

    if (patch.indexable !== undefined) {
        if (typeof patch.indexable !== 'boolean') throw new PublicSettingsError(400, 'indexable', 'Valor no válido.');
        update.public_indexable = patch.indexable;
    }

    if (Object.keys(update).length > 0) {
        const { error } = await db().from('profiles').update(update as never).eq('id', userId);
        if (error) {
            // Carrera: otra cuenta se quedó el handle entre la comprobación y el UPDATE.
            if (error.code === '23505') throw new PublicSettingsError(409, 'taken', 'Esa dirección ya la tiene otra persona.');
            throw new Error(error.message);
        }
    }
    return { ...current, ...rowToSettings({ ...settingsToRow(current), ...update }) };
}

function settingsToRow(s: OwnPublicSettings): Record<string, unknown> {
    return {
        public_handle: s.handle,
        public_handle_changed_at: s.handleChangedAt,
        public_visibility: s.visibility,
        public_since: s.since,
        public_bio: s.bio,
        public_four: s.four,
        public_sections: s.sections,
        public_indexable: s.indexable,
        public_archetype: s.archetype,
    };
}

/** Guarda el arquetipo calculado (lo calcula quien tiene la sesión del dueño). */
export async function saveOwnArchetype(a: Omit<PublicArchetype, 'computed_at'>): Promise<void> {
    const userId = requireAuthId();
    const value: PublicArchetype = { ...a, computed_at: new Date().toISOString() };
    const { error } = await db().from('profiles').update({ public_archetype: value as never }).eq('id', userId);
    if (error) throw new Error(error.message);
}

// -------------------------------------------------------------------------------------
// Colecciones públicas
// -------------------------------------------------------------------------------------

export interface OwnCollectionRow {
    id: string;
    name: string;
    icon: string | null;
    colorStamp: string | null;
    itemCount: number;
    isPublic: boolean;
}

export async function listOwnCollectionsForPublic(): Promise<OwnCollectionRow[]> {
    const userId = requireAuthId();
    const { data, error } = await db()
        .from('custom_lists')
        .select('id, name, icon, color_stamp, item_count, is_public, position, created_at')
        .eq('user_id', userId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
        id: r.id, name: r.name, icon: r.icon, colorStamp: r.color_stamp, itemCount: r.item_count, isPublic: r.is_public,
    }));
}

export async function setOwnCollectionPublic(listId: string, isPublic: boolean): Promise<boolean> {
    const userId = requireAuthId();
    const { data, error } = await db()
        .from('custom_lists')
        .update({ is_public: isPublic })
        .eq('user_id', userId)
        .eq('id', listId)
        .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
}

// -------------------------------------------------------------------------------------
// Títulos ocultos del perfil (solo afectan a «Lo último visto» y «Mejor valoradas»)
// -------------------------------------------------------------------------------------

export interface HiddenTitle {
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    title: string | null;
    posterPath: string | null;
    hiddenAt: string;
}

export async function listOwnHiddenTitles(): Promise<HiddenTitle[]> {
    const userId = requireAuthId();
    const { data, error } = await db()
        .from('profile_hidden_titles')
        .select('media_type, tmdb_id, title, poster_path, hidden_at')
        .eq('user_id', userId)
        .order('hidden_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
        mediaType: r.media_type, tmdbId: r.tmdb_id, title: r.title, posterPath: r.poster_path, hiddenAt: r.hidden_at,
    }));
}

/** ¿Está oculto este título del perfil? (interruptor de la ficha). */
export async function isOwnTitleHidden(mediaType: 'movie' | 'tv', tmdbId: number): Promise<boolean> {
    const userId = requireAuthId();
    const { count, error } = await db()
        .from('profile_hidden_titles')
        .select('tmdb_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
}

export async function hideOwnTitle(input: { mediaType: unknown; tmdbId: unknown; title?: unknown; posterPath?: unknown }): Promise<void> {
    const userId = requireAuthId();
    const mediaType = input.mediaType === 'movie' || input.mediaType === 'tv' ? input.mediaType : null;
    const tmdbId = Number(input.tmdbId);
    if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) throw new PublicSettingsError(400, 'title', 'Título no válido.');
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) || null : null;
    const posterPath = typeof input.posterPath === 'string' && /^\/[\w.-]+$/.test(input.posterPath) ? input.posterPath : null;
    const { error } = await db().from('profile_hidden_titles').upsert(
        { user_id: userId, media_type: mediaType, tmdb_id: tmdbId, title, poster_path: posterPath },
        { onConflict: 'user_id,media_type,tmdb_id' },
    );
    if (error) throw new Error(error.message);
}

export async function unhideOwnTitle(input: { mediaType: unknown; tmdbId: unknown }): Promise<void> {
    const userId = requireAuthId();
    const mediaType = input.mediaType === 'movie' || input.mediaType === 'tv' ? input.mediaType : null;
    const tmdbId = Number(input.tmdbId);
    if (!mediaType || !Number.isInteger(tmdbId) || tmdbId <= 0) throw new PublicSettingsError(400, 'title', 'Título no válido.');
    const { error } = await db().from('profile_hidden_titles').delete()
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', tmdbId);
    if (error) throw new Error(error.message);
}
