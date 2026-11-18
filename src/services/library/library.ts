/**
 * Acceso a `library_items` — las 13 listas fijas (MovieFavs, SeriesSiguiendo…) en una tabla.
 *
 * Devuelve las filas con la MISMA forma que tenían los documentos de Firestore
 * (`{ id, added_at, opinion?, rating?, position? }`, con `id` = tmdb_id en texto), para que
 * las páginas y los handlers no noten el cambio. `collection` es literalmente el nombre de la
 * colección de siempre.
 *
 * Cada escritura avisa a las cachés que leen las listas (`libraryChanged('lists')`, ver libraryChanges.ts).
 */
import { db, fetchAll, getAuthId, requireAuthId } from '../db/userScope';
import { libraryChanged } from './libraryChanges';

export interface ListDoc {
    id: string;
    added_at: string;
    opinion?: string;
    rating?: number;
    position?: number;
}

export interface LibraryRow {
    collection: string;
    tmdb_id: number;
    added_at: string;
    opinion: string | null;
    rating: number | null;
    position: number | null;
}

const COLUMNS = 'collection, tmdb_id, added_at, opinion, rating, position';

/** Fila de Postgres → documento como lo devolvía Firestore (sin claves a null). */
export function toListDoc(r: LibraryRow): ListDoc {
    const doc: ListDoc = { id: String(r.tmdb_id), added_at: r.added_at };
    if (r.opinion) doc.opinion = r.opinion;
    if (r.rating !== null && r.rating !== undefined) doc.rating = Number(r.rating);
    if (r.position !== null && r.position !== undefined) doc.position = r.position;
    return doc;
}

/** Una colección entera, ordenada como la pedía Firestore. Invitado → []. */
export async function listCollection(
    collection: string,
    orderField: 'added_at' | 'position' = 'added_at',
    direction: 'asc' | 'desc' = 'desc',
): Promise<ListDoc[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<LibraryRow>((from, to) =>
        db().from('library_items').select(COLUMNS)
            .eq('user_id', userId).eq('collection', collection)
            .order(orderField, { ascending: direction === 'asc', nullsFirst: false })
            .order('tmdb_id', { ascending: true }) // desempate estable para paginar
            .range(from, to),
    );
    return rows.map(toListDoc);
}

/**
 * Todas las listas en las que está UN título, en una consulta (en Firestore eran 6-7
 * lecturas sueltas, una por colección). Mapa colección → fila.
 */
export async function titleMembership(mediaType: 'movie' | 'tv', tmdbId: number | string): Promise<Map<string, LibraryRow>> {
    const userId = getAuthId();
    const out = new Map<string, LibraryRow>();
    const id = Number(tmdbId);
    if (!userId || !Number.isInteger(id)) return out;
    const { data, error } = await db().from('library_items').select(COLUMNS)
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', id);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as LibraryRow[]) out.set(r.collection, r);
    return out;
}

/** ¿Está este título en esta colección? */
export async function inCollection(collection: string, tmdbId: number | string): Promise<boolean> {
    const userId = getAuthId();
    if (!userId) return false;
    const { count, error } = await db().from('library_items').select('tmdb_id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('collection', collection).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
}

/** Nº de títulos de una colección (sin leerlos). */
export async function countCollection(collection: string): Promise<number> {
    const userId = requireAuthId();
    const { count, error } = await db().from('library_items').select('tmdb_id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('collection', collection);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

/** Alta en varias colecciones a la vez (ignora las que ya lo tuvieran). */
export async function addToCollections(
    tmdbId: number | string,
    entries: { collection: string; opinion?: string; rating?: number; position?: number }[],
): Promise<void> {
    if (!entries.length) return;
    const userId = requireAuthId();
    const now = new Date().toISOString();
    const rows = entries.map((e) => ({
        user_id: userId,
        collection: e.collection,
        tmdb_id: Number(tmdbId),
        added_at: now,
        opinion: e.opinion ?? null,
        rating: e.rating ?? null,
        position: e.position ?? null,
    }));
    const { error } = await db().from('library_items')
        .upsert(rows, { onConflict: 'user_id,collection,tmdb_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/** Baja de una o varias colecciones. */
export async function removeFromCollections(tmdbId: number | string, collections: string[]): Promise<void> {
    if (!collections.length) return;
    const userId = requireAuthId();
    const { error } = await db().from('library_items').delete()
        .eq('user_id', userId).eq('tmdb_id', Number(tmdbId)).in('collection', collections);
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/** Vacía una colección entera. */
export async function clearCollection(collection: string): Promise<void> {
    const userId = requireAuthId();
    const { error } = await db().from('library_items').delete().eq('user_id', userId).eq('collection', collection);
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/**
 * Cambia opinión/nota en TODAS las listas donde está el título (se copian en cada una, como
 * en Firestore). Un único UPDATE en vez de leer y escribir colección por colección.
 * `null` borra el campo (lo que antes era FieldValue.delete()).
 */
export async function patchTitle(
    mediaType: 'movie' | 'tv',
    tmdbId: number | string,
    patch: { opinion?: string | null; rating?: number | null },
): Promise<void> {
    const userId = requireAuthId();
    const { error } = await db().from('library_items').update(patch)
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/** Posición de un título en su colección (listas ordenables). */
export async function setPosition(collection: string, tmdbId: number | string, position: number): Promise<void> {
    const userId = requireAuthId();
    const { error } = await db().from('library_items').update({ position })
        .eq('user_id', userId).eq('collection', collection).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/** Desplaza posiciones en [from, to] (to null = hasta el final). Ver migración list_positions. */
export async function shiftPositions(collection: string, from: number, to: number | null, delta: number): Promise<void> {
    const { error } = await db().rpc('shift_list_positions', {
        p_collection: collection, p_from: from, p_to: to as number, p_delta: delta,
    });
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/**
 * Listas que se ordenan a mano desde su página (Ver pronto, 2026-11-18). Solo estas: en las demás el orden
 * lo da la fecha (o, en Favoritos de series, su propia numeración con `setPosition`).
 */
export const MANUAL_ORDER_COLLECTIONS = ['MoviesVerPronto', 'SeriesVerPronto'] as const;
export type ManualOrderCollection = typeof MANUAL_ORDER_COLLECTIONS[number];
export function isManualOrderCollection(c: string): c is ManualOrderCollection {
    return (MANUAL_ORDER_COLLECTIONS as readonly string[]).includes(c);
}

/**
 * Una lista ordenable, en su orden:
 *   · si nunca la has ordenado (ninguna fila con posición), como siempre: lo último guardado primero;
 *   · si ya la ordenaste, tu orden, y DETRÁS lo que añadiste después, de más antiguo a más reciente
 *     (como una cola: lo nuevo no se cuela delante de lo que ya habías priorizado).
 * Así da igual por dónde entre lo nuevo (ficha, ⌘K, un plan, una importación): no hay que tocar las altas.
 */
export async function listManualOrder(collection: ManualOrderCollection): Promise<ListDoc[]> {
    const docs = await listCollection(collection, 'added_at', 'desc');
    if (!docs.some((d) => d.position != null)) return docs;
    const placed = docs.filter((d) => d.position != null).sort((x, y) => (x.position as number) - (y.position as number));
    const added = docs.filter((d) => d.position == null).reverse();
    return [...placed, ...added];
}

/**
 * Guarda el orden de una lista ordenable: `tmdbIds` son los títulos que enseña la página, en su orden. Los
 * que no vengan (los que tienen plan no salen en la rejilla) quedan detrás en el orden que tenían
 * (función `reorder_library_items`, migración 20261118090000_library_order.sql).
 */
export async function reorderCollection(collection: ManualOrderCollection, tmdbIds: number[]): Promise<void> {
    requireAuthId();
    const { error } = await db().rpc('reorder_library_items', { p_collection: collection, p_ids: tmdbIds });
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}

/** Renumera 1..n respetando el orden actual. */
export async function renumberPositions(collection: string): Promise<void> {
    const { error } = await db().rpc('renumber_list_positions', { p_collection: collection });
    if (error) throw new Error(error.message);
    libraryChanged('lists');
}
