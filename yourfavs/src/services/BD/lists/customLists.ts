/**
 * Listas personalizadas (Fase L1) — colecciones propias del usuario.
 *
 * Modelo (antes users/{uid}/customLists/{listId} + subcolección items):
 *   custom_lists        name · description · icon (emoji) · color_stamp · cover · item_count · position · created_at · updated_at
 *   custom_list_items   media_type · tmdb_id · title · poster_path · position · added_at
 * Hacia fuera, la forma de siempre: `colorStamp`, `itemCount` e items con id `${media_type}_${tmdb_id}`.
 *
 * `item_count` lo mantiene un trigger (antes un FieldValue.increment a mano en cada alta/baja,
 * que se podía desincronizar); `position` se persiste para el drag manual.
 *
 * Borrar una lista se lleva sus items por la FK (`on delete cascade`), y borrar la cuenta, todo.
 */
import { db, fetchAll, getAuthId, requireAuthId } from '../shared/userScope';

export type ColorStamp = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'pink' | 'slate';
export const LIST_COLORS: ColorStamp[] = ['red', 'amber', 'blue', 'green', 'purple', 'pink', 'slate'];

export const MAX_NAME = 60;
export const MAX_DESC = 280;
const MAX_ICON = 8; // un emoji puede ocupar varios code units

export interface CustomListCover {
    type: 'poster' | 'upload';
    poster_path?: string;   // type 'poster' → póster de un título de la lista (renderizable sin fetch)
    tmdb_id?: number;       // type 'poster' → referencia al título origen
    url?: string;           // type 'upload' → imagen propia (Fase L7)
}

export interface CustomList {
    id: string;
    name: string;
    description: string;
    icon: string;               // emoji
    colorStamp: ColorStamp;
    cover: CustomListCover | null;
    itemCount: number;
    position: number;
    created_at?: unknown;
    updated_at?: unknown;
}

export interface CustomListItem {
    id: string;                 // `${media_type}_${tmdb_id}`
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    position: number;
    added_at?: unknown;
}

export interface CustomListInput {
    name: string;
    description?: string;
    icon?: string;
    colorStamp?: string;
    cover?: CustomListCover | null;
}

export interface CustomListItemInput {
    media_type: 'movie' | 'tv';
    tmdb_id: number | string;
    title?: string;
    poster_path?: string | null;
}

// ---- saneado / validación (red de seguridad; los handlers validan también) ----

export function cleanName(raw: unknown): string {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}
function cleanDesc(raw: unknown): string {
    return String(raw ?? '').trim().slice(0, MAX_DESC);
}
function cleanIcon(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s ? Array.from(s).slice(0, 1).join('').slice(0, MAX_ICON) : '🎬';
}
function cleanColor(raw: unknown): ColorStamp {
    const s = String(raw ?? '');
    return (LIST_COLORS as string[]).includes(s) ? (s as ColorStamp) : 'slate';
}
function cleanCover(raw: unknown): CustomListCover | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;
    if (c.type === 'poster' && typeof c.poster_path === 'string' && c.poster_path) {
        const cover: CustomListCover = { type: 'poster', poster_path: String(c.poster_path).slice(0, 200) };
        if (Number.isFinite(Number(c.tmdb_id))) cover.tmdb_id = Number(c.tmdb_id);
        return cover;
    }
    if (c.type === 'upload' && typeof c.url === 'string' && c.url) {
        return { type: 'upload', url: String(c.url).slice(0, 500) };
    }
    return null;
}
function itemIdFor(mediaType: 'movie' | 'tv', tmdbId: number | string): string {
    return `${mediaType}_${tmdbId}`;
}

// ---- lecturas ----

const LIST_COLUMNS = 'id, name, description, icon, color_stamp, cover, item_count, position, created_at, updated_at';
const ITEM_COLUMNS = 'media_type, tmdb_id, title, poster_path, position, added_at';

function toList(r: Record<string, any>): CustomList {
    return {
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        icon: r.icon ?? '',
        colorStamp: (r.color_stamp ?? 'slate') as ColorStamp,
        cover: (r.cover ?? null) as CustomListCover | null,
        itemCount: r.item_count ?? 0,
        position: r.position ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}

function toItem(r: Record<string, any>): CustomListItem {
    return {
        id: itemIdFor(r.media_type, r.tmdb_id),
        media_type: r.media_type,
        tmdb_id: r.tmdb_id,
        title: r.title ?? '',
        poster_path: r.poster_path ?? null,
        position: r.position ?? 0,
        added_at: r.added_at,
    };
}

/** `movie_550` → { media_type: 'movie', tmdb_id: 550 } (null si no tiene esa forma). */
function parseItemId(itemId: string): { media_type: 'movie' | 'tv'; tmdb_id: number } | null {
    const m = /^(movie|tv)_(\d+)$/.exec(itemId);
    return m ? { media_type: m[1] as 'movie' | 'tv', tmdb_id: Number(m[2]) } : null;
}

export async function getCustomLists(): Promise<CustomList[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<Record<string, any>>((from, to) =>
        db().from('custom_lists').select(LIST_COLUMNS).eq('user_id', userId)
            .order('position', { nullsFirst: false }).order('created_at').range(from, to),
    );
    return rows.map(toList);
}

export async function getCustomList(listId: string): Promise<CustomList | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('custom_lists').select(LIST_COLUMNS)
        .eq('user_id', userId).eq('id', listId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toList(data) : null;
}

export async function getListItems(listId: string): Promise<CustomListItem[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<Record<string, any>>((from, to) =>
        db().from('custom_list_items').select(ITEM_COLUMNS).eq('user_id', userId).eq('list_id', listId)
            .order('position', { nullsFirst: false }).order('added_at').range(from, to),
    );
    return rows.map(toItem);
}

/**
 * Para el popover "Guardar en…": todas las listas + en cuáles está ya el item.
 * Dos consultas en total (antes: una lectura por lista).
 */
export async function getListsMembership(
    mediaType: 'movie' | 'tv',
    tmdbId: number | string
): Promise<{ lists: CustomList[]; memberIds: string[] }> {
    const lists = await getCustomLists();
    if (lists.length === 0) return { lists, memberIds: [] };
    const { data, error } = await db().from('custom_list_items').select('list_id')
        .eq('user_id', requireAuthId()).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
    const member = new Set((data ?? []).map((r) => r.list_id));
    return { lists, memberIds: lists.filter(l => member.has(l.id)).map(l => l.id) };
}

// ---- escrituras: listas ----

export async function createList(input: CustomListInput): Promise<string> {
    const userId = requireAuthId();
    const name = cleanName(input.name);
    if (!name) throw new Error('El nombre es obligatorio');

    const { data: last, error: lastError } = await db().from('custom_lists').select('position')
        .eq('user_id', userId).order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (lastError) throw new Error(lastError.message);
    const maxPos = Math.max(0, Number(last?.position) || 0);

    const { data, error } = await db().from('custom_lists').insert({
        user_id: userId,
        name,
        description: cleanDesc(input.description),
        icon: cleanIcon(input.icon),
        color_stamp: cleanColor(input.colorStamp),
        cover: cleanCover(input.cover) as never,
        position: maxPos + 1,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
}

export async function updateList(listId: string, patch: Partial<CustomListInput>): Promise<void> {
    const userId = requireAuthId();
    const update: Record<string, unknown> = {}; // updated_at: lo pone el trigger
    if (patch.name !== undefined) {
        const n = cleanName(patch.name);
        if (!n) throw new Error('El nombre es obligatorio');
        update.name = n;
    }
    if (patch.description !== undefined) update.description = cleanDesc(patch.description);
    if (patch.icon !== undefined) update.icon = cleanIcon(patch.icon);
    if (patch.colorStamp !== undefined) update.color_stamp = cleanColor(patch.colorStamp);
    if (patch.cover !== undefined) update.cover = cleanCover(patch.cover);
    // `select` para saber si la lista existía (0 filas = no es tuya o no existe).
    const { data, error } = await db().from('custom_lists').update(update as never)
        .eq('user_id', userId).eq('id', listId).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Lista no encontrada');
}

export async function deleteList(listId: string): Promise<void> {
    const userId = requireAuthId();
    // Los items se van con la lista (FK on delete cascade).
    const { error } = await db().from('custom_lists').delete().eq('user_id', userId).eq('id', listId);
    if (error) throw new Error(error.message);
}

/** Reordena las listas del hub: `orderedIds` = nuevo orden completo → position = índice+1. */
export async function reorderLists(orderedIds: string[]): Promise<void> {
    requireAuthId();
    const { error } = await db().rpc('reorder_custom_lists', { p_ids: orderedIds });
    if (error) throw new Error(error.message);
}

// ---- escrituras: items ----

export async function addItemToList(listId: string, item: CustomListItemInput): Promise<{ itemCount: number }> {
    const userId = requireAuthId();
    const list = await getCustomList(listId);
    if (!list) throw new Error('Lista no encontrada');

    const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(item.tmdb_id);
    if (!Number.isFinite(tmdbId)) throw new Error('tmdb_id inválido');

    const { data: last, error: lastError } = await db().from('custom_list_items').select('position')
        .eq('user_id', userId).eq('list_id', listId)
        .order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (lastError) throw new Error(lastError.message);
    const maxPos = Number(last?.position) || 0;

    // Idempotente: si ya está, no se inserta ni se recuenta (el trigger solo cuenta altas reales).
    const { data: inserted, error } = await db().from('custom_list_items').upsert({
        user_id: userId,
        list_id: listId,
        media_type: mediaType,
        tmdb_id: tmdbId,
        title: String(item.title ?? '').slice(0, 200),
        poster_path: item.poster_path ? String(item.poster_path) : null,
        position: maxPos + 1,
    }, { onConflict: 'user_id,list_id,media_type,tmdb_id', ignoreDuplicates: true }).select('tmdb_id');
    if (error) throw new Error(error.message);
    return { itemCount: list.itemCount + (inserted?.length ? 1 : 0) };
}

export async function removeItemFromList(listId: string, itemId: string): Promise<void> {
    const userId = requireAuthId();
    const key = parseItemId(itemId);
    if (!key) return;
    const { data: removed, error } = await db().from('custom_list_items').delete()
        .eq('user_id', userId).eq('list_id', listId).eq('media_type', key.media_type).eq('tmdb_id', key.tmdb_id)
        .select('tmdb_id');
    if (error) throw new Error(error.message);
    if (!removed?.length) return; // ya no estaba → nada que registrar

    // §5 · bitácora (best-effort): quitar un título de una colección es intencional.
    try {
        const { appendActivity } = await import('../shared/activityLog');
        await appendActivity({
            verb: 'remove',
            media_type: key.media_type,
            tmdb_id: key.tmdb_id,
            meta: { custom: true, listId },
        });
    } catch { /* bitácora opcional */ }
}

/** Reordena los items de una lista: `orderedItemIds` = nuevo orden completo. */
export async function reorderItems(listId: string, orderedItemIds: string[]): Promise<void> {
    requireAuthId();
    const { error } = await db().rpc('reorder_custom_list_items', { p_list_id: listId, p_item_ids: orderedItemIds });
    if (error) throw new Error(error.message);
}
