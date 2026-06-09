/**
 * Listas personalizadas (Fase L1) — colecciones propias del usuario.
 *
 * Modelo:
 *   users/{uid}/customLists/{listId}
 *     name · description · icon (emoji) · colorStamp · cover · itemCount · position · created_at · updated_at
 *   users/{uid}/customLists/{listId}/items/{itemId}   // itemId = `${media_type}_${tmdb_id}`
 *     media_type · tmdb_id · title · poster_path · position · added_at
 *
 * Acceso por Admin SDK vía userScope (uid de la sesión, NUNCA del cliente).
 * `itemCount` y `position` están denormalizados: el hub lista sin contar items,
 * y el orden (de listas y de items) se persiste para el drag manual.
 *
 * El borrado de cuenta usa recursiveDelete(users/{uid}), que ya cubre estas
 * subcolecciones; `deleteList` hace recursiveDelete del subárbol de la lista.
 */
import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from '../../../utils/firebaseAdmin';
import { userCol, userDoc, requireUid, getCurrentUid } from '../shared/userScope';

const COLLECTION = 'customLists';
const ITEMS = 'items';

export type ColorStamp = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'pink' | 'slate';
export const LIST_COLORS: ColorStamp[] = ['red', 'amber', 'blue', 'green', 'purple', 'pink', 'slate'];

export const MAX_NAME = 60;
export const MAX_DESC = 280;
const MAX_ICON = 8; // un emoji puede ocupar varios code units

export interface CustomListCover {
    type: 'poster' | 'upload';
    tmdb_id?: number;   // type 'poster' → póster de un título de la lista
    url?: string;       // type 'upload' → imagen propia (Fase L7)
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
    if (c.type === 'poster' && Number.isFinite(Number(c.tmdb_id))) {
        return { type: 'poster', tmdb_id: Number(c.tmdb_id) };
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

export async function getCustomLists(): Promise<CustomList[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).orderBy('position').get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) } as CustomList));
}

export async function getCustomList(listId: string): Promise<CustomList | null> {
    if (!getCurrentUid()) return null;
    const snap = await userDoc(COLLECTION, listId).get();
    return snap.exists ? ({ id: snap.id, ...(snap.data() as DocumentData) } as CustomList) : null;
}

export async function getListItems(listId: string): Promise<CustomListItem[]> {
    if (!getCurrentUid()) return [];
    const snap = await userDoc(COLLECTION, listId).collection(ITEMS).orderBy('position').get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as DocumentData) } as CustomListItem));
}

/**
 * Para el popover "Guardar en…": todas las listas + en cuáles está ya el item.
 * Una lectura por lista (lookup directo del doc item por id) → barato.
 */
export async function getListsMembership(
    mediaType: 'movie' | 'tv',
    tmdbId: number | string
): Promise<{ lists: CustomList[]; memberIds: string[] }> {
    const lists = await getCustomLists();
    if (lists.length === 0) return { lists, memberIds: [] };
    const itemId = itemIdFor(mediaType, tmdbId);
    const snaps = await Promise.all(
        lists.map(l => userDoc(COLLECTION, l.id).collection(ITEMS).doc(itemId).get())
    );
    const memberIds = lists.filter((_, i) => snaps[i].exists).map(l => l.id);
    return { lists, memberIds };
}

// ---- escrituras: listas ----

export async function createList(input: CustomListInput): Promise<string> {
    requireUid();
    const name = cleanName(input.name);
    if (!name) throw new Error('El nombre es obligatorio');

    const existing = await userCol(COLLECTION).get();
    const maxPos = existing.empty
        ? 0
        : Math.max(0, ...existing.docs.map(d => Number(d.data().position) || 0));

    const ref = userCol(COLLECTION).doc();
    const now = new Date();
    const doc: Omit<CustomList, 'id'> = {
        name,
        description: cleanDesc(input.description),
        icon: cleanIcon(input.icon),
        colorStamp: cleanColor(input.colorStamp),
        cover: cleanCover(input.cover),
        itemCount: 0,
        position: maxPos + 1,
        created_at: now,
        updated_at: now,
    };
    await ref.set(doc);
    return ref.id;
}

export async function updateList(listId: string, patch: Partial<CustomListInput>): Promise<void> {
    requireUid();
    const ref = userDoc(COLLECTION, listId);
    if (!(await ref.get()).exists) throw new Error('Lista no encontrada');

    const update: Record<string, unknown> = { updated_at: new Date() };
    if (patch.name !== undefined) {
        const n = cleanName(patch.name);
        if (!n) throw new Error('El nombre es obligatorio');
        update.name = n;
    }
    if (patch.description !== undefined) update.description = cleanDesc(patch.description);
    if (patch.icon !== undefined) update.icon = cleanIcon(patch.icon);
    if (patch.colorStamp !== undefined) update.colorStamp = cleanColor(patch.colorStamp);
    if (patch.cover !== undefined) update.cover = cleanCover(patch.cover);
    await ref.update(update);
}

export async function deleteList(listId: string): Promise<void> {
    requireUid();
    const ref = userDoc(COLLECTION, listId);
    // recursiveDelete borra el doc + su subcolección items en una pasada.
    await adminDb.recursiveDelete(ref);
}

/** Reordena las listas del hub: `orderedIds` = nuevo orden completo → position = índice+1. */
export async function reorderLists(orderedIds: string[]): Promise<void> {
    requireUid();
    const batch: WriteBatch = adminDb.batch();
    orderedIds.forEach((id, i) => batch.update(userDoc(COLLECTION, id), { position: i + 1 }));
    await batch.commit();
}

// ---- escrituras: items ----

export async function addItemToList(listId: string, item: CustomListItemInput): Promise<void> {
    requireUid();
    const listRef = userDoc(COLLECTION, listId);
    if (!(await listRef.get()).exists) throw new Error('Lista no encontrada');

    const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(item.tmdb_id);
    if (!Number.isFinite(tmdbId)) throw new Error('tmdb_id inválido');

    const itemRef = listRef.collection(ITEMS).doc(itemIdFor(mediaType, tmdbId));
    if ((await itemRef.get()).exists) return; // idempotente: ya está, no recontar

    const itemsSnap = await listRef.collection(ITEMS).orderBy('position', 'desc').limit(1).get();
    const maxPos = itemsSnap.empty ? 0 : (Number(itemsSnap.docs[0].data().position) || 0);

    const batch = adminDb.batch();
    batch.set(itemRef, {
        media_type: mediaType,
        tmdb_id: tmdbId,
        title: String(item.title ?? '').slice(0, 200),
        poster_path: item.poster_path ? String(item.poster_path) : null,
        position: maxPos + 1,
        added_at: new Date(),
    });
    batch.update(listRef, { itemCount: FieldValue.increment(1), updated_at: new Date() });
    await batch.commit();
}

export async function removeItemFromList(listId: string, itemId: string): Promise<void> {
    requireUid();
    const listRef = userDoc(COLLECTION, listId);
    const itemRef = listRef.collection(ITEMS).doc(itemId);
    if (!(await itemRef.get()).exists) return; // ya no está → nada que decrementar

    const batch = adminDb.batch();
    batch.delete(itemRef);
    batch.update(listRef, { itemCount: FieldValue.increment(-1), updated_at: new Date() });
    await batch.commit();
}

/** Reordena los items de una lista: `orderedItemIds` = nuevo orden completo. */
export async function reorderItems(listId: string, orderedItemIds: string[]): Promise<void> {
    requireUid();
    const itemsCol = userDoc(COLLECTION, listId).collection(ITEMS);
    const batch = adminDb.batch();
    orderedItemIds.forEach((id, i) => batch.update(itemsCol.doc(id), { position: i + 1 }));
    await batch.commit();
}
