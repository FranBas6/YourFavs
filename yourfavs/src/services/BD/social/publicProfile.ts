/**
 * Lectura del PERFIL PÚBLICO de otra persona (`/u/{handle}`) — handoff perfil público §5.4.
 *
 * Es la única puerta por la que el servidor lee filas de un usuario que no es el de la sesión, así
 * que funciona con tres reglas que no se pueden saltar:
 *
 *   1. **Primero la visibilidad.** `getPublicProfile` busca el perfil, comprueba si el visitante
 *      puede verlo y solo entonces carga las secciones. Los cargadores (`loadX`) NO se exportan:
 *      fuera de este archivo no hay forma de pedir datos sin pasar por la comprobación.
 *   2. **Siempre el dueño explícito y columnas cerradas.** Cada consulta filtra por `user_id` del
 *      dueño y pide solo lo que pinta la página. Nunca salen `email`, las notas del diario
 *      (`watch_log.note`), las opiniones (`library_items.opinion`) ni las notas privadas de
 *      `media_tags`.
 *   3. **Sin RLS abierta.** No hay políticas nuevas para `anon`: esto va con la clave secreta
 *      (`supabaseAdmin`) desde el servidor, y el navegador nunca habla con Supabase.
 *
 * Caché: 60 s por handle para los visitantes (el dueño siempre lee en fresco). Al cambiar el handle
 * o la visibilidad se vacía la entrada de esta instancia; en otras instancias y en el CDN puede
 * tardar hasta unos minutos en verse (asumido en docs/PLAN_SOCIAL.md).
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { normalizeHandle, handleShapeProblem } from './handles';
import { sanitizeFour, type PublicPick, type PublicArchetype, type PublicVisibility } from './publicSettings';
import { resolvePublicSections, type PublicSectionPref } from '../../../utils/constants/publicSections';
import { getTitleSummaries, titleKey, type TitleRef } from '../../API/shared/titleSummaries';
import { getRelation, isBlockedBy } from './graph';
import type { Relation } from '../../../lib/social/types';

export type ViewerRole = 'owner' | 'member' | 'guest';

export interface PublicFav { tmdb_id: number; rank: number; title: string; poster_path: string | null; seasons: number | null }
export interface PublicLogCard {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    year: string | null;
    /** Solo series: temporada del grupo (null si el registro no la tenía). */
    season: number | null;
    /** Solo series: episodios DISTINTOS del grupo. */
    episodes: number;
    /** Día más reciente del grupo (`YYYY-MM-DD`). */
    watched_on: string;
    /** Solo películas: nota del dueño, si la hay. */
    rating: number | null;
}
export interface PublicBest { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null; year: string | null; rating: number }
export interface PublicCollection {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    colorStamp: string | null;
    itemCount: number;
    cover: { type?: string; poster_path?: string; url?: string } | null;
    /** Los 3 primeros pósters, para la portada. */
    posters: string[];
}

export interface PublicProfileView {
    ownerId: string;
    handle: string;
    name: string;
    hasAvatar: boolean;
    /** Versión del avatar para romper la caché del navegador al cambiarlo. */
    avatarVersion: string;
    visibility: PublicVisibility;
    since: string | null;
    viewerRole: ViewerRole;
    /** «Solo amigos» visto por quien no lo es (F3): solo identidad, sin secciones. */
    locked: boolean;
    /** Relación de quien mira con el dueño (solo `member`; null para dueño e invitado). */
    rel: Relation | null;
    bio: string;
    archetype: PublicArchetype | null;
    indexable: boolean;
    counts: { episodes: number; movies: number; series: number; publicCollections: number };
    four: PublicPick[];
    sections: PublicSectionPref[];
    favs: PublicFav[];
    log: PublicLogCard[];
    best: PublicBest[];
    collections: PublicCollection[];
    /** Solo dueño: cuántas colecciones propias tiene en total (para el vacío de «Colecciones»). */
    ownCollectionsTotal: number | null;
}

const FAVS_LIMIT = 10;
const LOG_CARDS = 12;
const LOG_SCAN = 300;
const BEST_LIMIT = 12;
const CACHE_TTL_MS = 60 * 1000;

type CachedData = Omit<PublicProfileView, 'viewerRole' | 'locked' | 'ownCollectionsTotal' | 'rel'>;
const cache = new Map<string, { data: CachedData; expires: number }>();

/** Vacía la entrada de un handle en esta instancia (cambio de handle o de visibilidad). */
export function invalidatePublicProfileCache(handle: string | null | undefined): void {
    if (handle) cache.delete(handle.toLowerCase());
}

interface ProfileRow {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    updated_at: string;
    public_handle: string;
    public_visibility: string;
    public_since: string | null;
    public_bio: string | null;
    public_four: unknown;
    public_sections: unknown;
    public_indexable: boolean;
    public_archetype: unknown;
}

const PROFILE_COLUMNS = 'id, display_name, avatar_url, updated_at, public_handle, public_visibility, public_since, public_bio, public_four, public_sections, public_indexable, public_archetype';

/** Busca el perfil por handle. Devuelve la fila solo si el perfil está ENCENDIDO. */
export async function findPublicProfileRow(rawHandle: string): Promise<ProfileRow | null> {
    const handle = normalizeHandle(rawHandle);
    if (handleShapeProblem(handle) === 'format') return null;
    const { data, error } = await supabaseAdmin()
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('public_handle', handle)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as ProfileRow | null;
    if (!row || row.public_visibility === 'off') return null;
    return row;
}

/**
 * ¿Puede este visitante ver el contenido? En F1 solo existen «off» (ya filtrado) y «public».
 * «friends» deja ver la identidad a cualquiera (para poder pedir la amistad) y el contenido solo al
 * dueño; en F3 se sumarán los amigos.
 */
function canSeeContent(row: ProfileRow, role: ViewerRole): boolean {
    if (role === 'owner') return true;
    return row.public_visibility === 'public';
}

/**
 * Nombre y foto de la CUENTA (metadatos de Auth: los de Google, o el nombre del registro). Son el
 * respaldo de lo que el dueño no haya personalizado en Ajustes → Perfil, igual que hace el
 * middleware para la propia app. Solo se pide si hace falta: con nombre y avatar propios, nada.
 */
async function accountMeta(userId: string): Promise<{ name: string | null; picture: string | null }> {
    try {
        const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
        const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        const pic = str(meta.avatar_url) ?? str(meta.picture);
        return {
            name: str(meta.full_name) ?? str(meta.name) ?? str(meta.display_name),
            picture: pic && /^https:\/\//.test(pic) ? pic : null,
        };
    } catch {
        return { name: null, picture: null };
    }
}

/** Nombre y origen de la foto del dueño, con el respaldo de la cuenta. */
async function resolveIdentity(row: Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url' | 'public_handle'>) {
    const ownName = row.display_name?.trim() || null;
    const meta = !ownName || !row.avatar_url ? await accountMeta(row.id) : { name: null, picture: null };
    return {
        name: ownName ?? meta.name ?? row.public_handle,
        avatarSrc: row.avatar_url ?? meta.picture,
    };
}

/** URL de la foto del dueño para el endpoint público del avatar (nunca va al HTML). */
export async function resolveAvatarSource(row: Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url' | 'public_handle'>): Promise<string | null> {
    return (await resolveIdentity(row)).avatarSrc;
}

// -------------------------------------------------------------------------------------
// Cargadores (privados: solo los llama getPublicProfile tras comprobar la visibilidad)
// -------------------------------------------------------------------------------------

async function loadHidden(ownerId: string): Promise<Set<string>> {
    const { data, error } = await supabaseAdmin()
        .from('profile_hidden_titles')
        .select('media_type, tmdb_id')
        .eq('user_id', ownerId);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((r) => `${r.media_type}:${r.tmdb_id}`));
}

async function countRows(table: 'watched_episodes' | 'library_items' | 'custom_lists', ownerId: string, extra?: (q: any) => any): Promise<number> {
    let q: any = supabaseAdmin().from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', ownerId);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
}

async function loadCounts(ownerId: string) {
    const [episodes, movies, series, publicCollections] = await Promise.all([
        countRows('watched_episodes', ownerId),
        countRows('library_items', ownerId, (q) => q.eq('collection', 'MoviesVistas')),
        countRows('library_items', ownerId, (q) => q.eq('collection', 'SeriesVistas')),
        countRows('custom_lists', ownerId, (q) => q.eq('is_public', true)),
    ]);
    return { episodes, movies, series, publicCollections };
}

async function loadFavIds(ownerId: string): Promise<number[]> {
    const { data, error } = await supabaseAdmin()
        .from('library_items')
        .select('tmdb_id, position, added_at')
        .eq('user_id', ownerId)
        .eq('collection', 'SeriesFavs')
        .order('position', { ascending: true, nullsFirst: false })
        .order('added_at', { ascending: false })
        .limit(FAVS_LIMIT);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.tmdb_id);
}

interface LogGroup { media_type: 'movie' | 'tv'; tmdb_id: number; season: number | null; episodes: Set<string>; watched_on: string }

/**
 * Agrupa el diario (handoff §6.4): las filas CONSECUTIVAS de la misma serie y temporada son una
 * tarjeta; una película es siempre una tarjeta sola. Para no recorrer el diario entero se leen como
 * mucho 300 filas y se para al llegar a 12 tarjetas.
 */
async function loadLogGroups(ownerId: string, hidden: Set<string>): Promise<LogGroup[]> {
    const { data, error } = await supabaseAdmin()
        .from('watch_log')
        .select('media_type, tmdb_id, season, episode, watched_on, logged_at')   // sin `note`, a propósito
        .eq('user_id', ownerId)
        .order('watched_on', { ascending: false })
        .order('logged_at', { ascending: false })
        .limit(LOG_SCAN);
    if (error) throw new Error(error.message);

    const groups: LogGroup[] = [];
    for (const row of data ?? []) {
        if (hidden.has(`${row.media_type}:${row.tmdb_id}`)) continue;
        const last = groups[groups.length - 1];
        const sameSeries = last && row.media_type === 'tv' && last.media_type === 'tv'
            && last.tmdb_id === row.tmdb_id && last.season === (row.season ?? null);
        if (sameSeries) {
            if (row.episode != null) last.episodes.add(`${row.season}:${row.episode}`);
            continue;
        }
        if (groups.length >= LOG_CARDS) break;
        const episodes = new Set<string>();
        if (row.media_type === 'tv' && row.episode != null) episodes.add(`${row.season}:${row.episode}`);
        groups.push({ media_type: row.media_type, tmdb_id: row.tmdb_id, season: row.season ?? null, episodes, watched_on: row.watched_on });
    }
    return groups;
}

async function loadRatings(ownerId: string, refs: TitleRef[]): Promise<Map<string, number>> {
    const movieIds = refs.filter((r) => r.media_type === 'movie').map((r) => r.tmdb_id);
    if (!movieIds.length) return new Map();
    const { data, error } = await supabaseAdmin()
        .from('ratings')
        .select('media_type, tmdb_id, score')
        .eq('user_id', ownerId)
        .eq('media_type', 'movie')
        .in('tmdb_id', movieIds);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [`${r.media_type}:${r.tmdb_id}`, Number(r.score)]));
}

async function loadBestRefs(ownerId: string, hidden: Set<string>): Promise<{ ref: TitleRef; score: number }[]> {
    const { data, error } = await supabaseAdmin()
        .from('ratings')
        .select('media_type, tmdb_id, score, updated_at')
        .eq('user_id', ownerId)
        .order('score', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(BEST_LIMIT + hidden.size);   // los ocultos se quitan después: se piden de más
    if (error) throw new Error(error.message);
    return (data ?? [])
        .filter((r) => !hidden.has(`${r.media_type}:${r.tmdb_id}`))
        .slice(0, BEST_LIMIT)
        .map((r) => ({ ref: { media_type: r.media_type, tmdb_id: r.tmdb_id }, score: Number(r.score) }));
}

async function loadPublicCollections(ownerId: string): Promise<PublicCollection[]> {
    const { data, error } = await supabaseAdmin()
        .from('custom_lists')
        .select('id, name, description, icon, color_stamp, item_count, cover, position, created_at')
        .eq('user_id', ownerId)
        .eq('is_public', true)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const lists = data ?? [];
    if (!lists.length) return [];

    const { data: items, error: itemsError } = await supabaseAdmin()
        .from('custom_list_items')
        .select('list_id, poster_path, position, added_at')
        .eq('user_id', ownerId)
        .in('list_id', lists.map((l) => l.id))
        .order('position', { ascending: true, nullsFirst: false })
        .order('added_at', { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    const postersByList = new Map<string, string[]>();
    for (const it of items ?? []) {
        if (!it.poster_path) continue;
        const arr = postersByList.get(it.list_id) ?? [];
        if (arr.length < 3) arr.push(it.poster_path);
        postersByList.set(it.list_id, arr);
    }
    return lists.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? '',
        icon: l.icon,
        colorStamp: l.color_stamp,
        itemCount: l.item_count,
        cover: (l.cover as PublicCollection['cover']) ?? null,
        posters: postersByList.get(l.id) ?? [],
    }));
}

/** Todo lo que se pinta, para un perfil que el visitante PUEDE ver. */
async function loadContent(row: ProfileRow): Promise<CachedData> {
    const ownerId = row.id;
    const sections = resolvePublicSections(row.public_sections);
    const on = (id: string) => sections.some((s) => s.id === id && s.on);

    const hidden = await loadHidden(ownerId);
    const [counts, favIds, logGroups, bestRefs, collections, identity] = await Promise.all([
        loadCounts(ownerId),
        on('favs') ? loadFavIds(ownerId) : Promise.resolve([] as number[]),
        on('log') ? loadLogGroups(ownerId, hidden) : Promise.resolve([] as LogGroup[]),
        on('best') ? loadBestRefs(ownerId, hidden) : Promise.resolve([] as { ref: TitleRef; score: number }[]),
        on('collections') ? loadPublicCollections(ownerId) : Promise.resolve([] as PublicCollection[]),
        resolveIdentity(row),
    ]);

    const logRefs: TitleRef[] = logGroups.map((g) => ({ media_type: g.media_type, tmdb_id: g.tmdb_id }));
    const refs: TitleRef[] = [
        ...favIds.map((id) => ({ media_type: 'tv' as const, tmdb_id: id })),
        ...logRefs,
        ...bestRefs.map((b) => b.ref),
    ];
    const [summaries, logRatings] = await Promise.all([getTitleSummaries(refs), loadRatings(ownerId, logRefs)]);

    const favs: PublicFav[] = [];
    favIds.forEach((id) => {
        const s = summaries.get(`tv:${id}`);
        if (s) favs.push({ tmdb_id: id, rank: favs.length + 1, title: s.title, poster_path: s.poster_path, seasons: s.seasons });
    });
    const log: PublicLogCard[] = [];
    for (const g of logGroups) {
        const s = summaries.get(titleKey(g));
        if (!s) continue;
        log.push({
            media_type: g.media_type, tmdb_id: g.tmdb_id, title: s.title, poster_path: s.poster_path, year: s.year,
            season: g.season, episodes: g.episodes.size, watched_on: g.watched_on,
            rating: g.media_type === 'movie' ? logRatings.get(titleKey(g)) ?? null : null,
        });
    }
    const best: PublicBest[] = [];
    for (const b of bestRefs) {
        const s = summaries.get(titleKey(b.ref));
        if (s) best.push({ ...b.ref, title: s.title, poster_path: s.poster_path, year: s.year, rating: b.score });
    }

    let four: PublicPick[] = [];
    try { four = sanitizeFour(row.public_four); } catch { four = []; }

    return {
        ownerId,
        handle: row.public_handle,
        name: identity.name,
        hasAvatar: Boolean(identity.avatarSrc),
        avatarVersion: String(new Date(row.updated_at).getTime() || 0),
        visibility: row.public_visibility as PublicVisibility,
        since: row.public_since,
        bio: (row.public_bio ?? '').replace(/\s+/g, ' ').trim(),
        archetype: (row.public_archetype as PublicArchetype | null) ?? null,
        indexable: row.public_indexable === true,
        counts,
        four,
        sections,
        favs,
        log,
        best,
        collections,
    };
}

/**
 * Perfil público listo para pintar, o `null` si no existe / está apagado (→ 404).
 * `viewerId`: uid de la sesión, o null si es un invitado.
 */
export async function getPublicProfile(rawHandle: string, viewerId: string | null): Promise<PublicProfileView | null> {
    const row = await findPublicProfileRow(rawHandle);
    if (!row) return null;
    const viewerRole: ViewerRole = viewerId === row.id ? 'owner' : viewerId ? 'member' : 'guest';

    // Bloqueos (F2): a quien el dueño bloqueó le sale el MISMO 404 que a un perfil inexistente, sin
    // pistas. Quien bloqueó al dueño ve solo la cabecera reducida con «Desbloquear».
    let rel: Relation | null = null;
    if (viewerRole === 'member' && viewerId) {
        if (await isBlockedBy(viewerId, row.id)) return null;
        rel = await getRelation(viewerId, row.id);
    }

    if (!canSeeContent(row, viewerRole) || rel?.blockedByMe) {
        const identity = await resolveIdentity(row);
        return {
            ownerId: row.id, handle: row.public_handle, name: identity.name,
            hasAvatar: Boolean(identity.avatarSrc), avatarVersion: String(new Date(row.updated_at).getTime() || 0),
            visibility: row.public_visibility as PublicVisibility, since: row.public_since,
            viewerRole, locked: true, rel, bio: '', archetype: null, indexable: row.public_indexable === true,
            counts: { episodes: 0, movies: 0, series: 0, publicCollections: 0 },
            four: [], sections: [], favs: [], log: [], best: [], collections: [], ownCollectionsTotal: null,
        };
    }

    let data: CachedData;
    const key = row.public_handle.toLowerCase();
    const hit = cache.get(key);
    if (viewerRole !== 'owner' && hit && hit.expires > Date.now()) {
        data = hit.data;
    } else {
        data = await loadContent(row);
        cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
    }

    const ownCollectionsTotal = viewerRole === 'owner' ? await countRows('custom_lists', row.id) : null;
    return { ...data, viewerRole, locked: false, rel, ownCollectionsTotal };
}

/** Una colección pública en solo lectura (`/u/{handle}/coleccion/{id}`), o null → 404. */
export async function getPublicCollection(rawHandle: string, listId: string, viewerId: string | null) {
    const row = await findPublicProfileRow(rawHandle);
    if (!row) return null;
    const viewerRole: ViewerRole = viewerId === row.id ? 'owner' : viewerId ? 'member' : 'guest';
    if (!canSeeContent(row, viewerRole)) return null;
    // Con un bloqueo en cualquier sentido, la colección tampoco existe para quien mira.
    if (viewerRole === 'member' && viewerId) {
        if (await isBlockedBy(viewerId, row.id) || (await getRelation(viewerId, row.id)).blockedByMe) return null;
    }

    const { data: list, error } = await supabaseAdmin()
        .from('custom_lists')
        .select('id, name, description, icon, color_stamp, item_count, cover, is_public')
        .eq('user_id', row.id)
        .eq('id', listId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!list || !list.is_public) return null;

    const { data: items, error: itemsError } = await supabaseAdmin()
        .from('custom_list_items')
        .select('media_type, tmdb_id, title, poster_path, position, added_at')
        .eq('user_id', row.id)
        .eq('list_id', listId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('added_at', { ascending: true });
    if (itemsError) throw new Error(itemsError.message);

    return {
        ownerName: (await resolveIdentity(row)).name,
        handle: row.public_handle,
        indexable: row.public_indexable === true,
        viewerRole,
        list: {
            id: list.id, name: list.name, description: list.description ?? '', icon: list.icon,
            colorStamp: list.color_stamp, itemCount: list.item_count,
        },
        items: (items ?? []).map((i) => ({ media_type: i.media_type, tmdb_id: i.tmdb_id, title: i.title ?? '', poster_path: i.poster_path })),
    };
}
