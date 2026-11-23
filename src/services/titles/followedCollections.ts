import { db, fetchAll, getAuthId, requireAuthId } from "../db/userScope";
import { getMovieCollectionInfo } from "../movies/movieDetail";

/**
 * Sagas que sigues (2026-11-23, C2). «Seguir saga» es una sola acción: la saga sale en Mis listas ›
 * Sagas y la campana avisa de sus películas nuevas (eso, en el paso de avisos). Tabla
 * `followed_collections` (migración 20261123100000), como `followed_people`: se guardan nombre e
 * imágenes al seguirla para pintar la lista sin esperar a TMDB.
 *
 * El nombre y las imágenes los pide el servidor a TMDB (no se fían del cliente) y ya vienen limpios
 * (`getMovieCollectionInfo`: «Dune», no «Dune - Colección»).
 */
export interface FollowedCollection {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
    added_at: Date;
}

interface Row { collection_id: number; name: string | null; poster_path: string | null; backdrop_path: string | null; added_at: string }

const toItem = (r: Row): FollowedCollection => ({
    id: r.collection_id,
    name: r.name ?? '',
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    added_at: new Date(r.added_at),
});

/** Seguir una saga. Devuelve false si la saga no existe en TMDB. */
export async function followCollection(collectionId: number): Promise<boolean> {
    const info = await getMovieCollectionInfo(collectionId);
    if (!info) return false;
    const { error } = await db().from('followed_collections').upsert(
        {
            user_id: requireAuthId(), collection_id: collectionId, name: info.name,
            poster_path: info.poster_path, backdrop_path: info.backdrop_path, added_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,collection_id' },
    );
    if (error) throw new Error(error.message);
    return true;
}

export async function unfollowCollection(collectionId: number): Promise<void> {
    const { error } = await db().from('followed_collections').delete()
        .eq('user_id', requireAuthId()).eq('collection_id', collectionId);
    if (error) throw new Error(error.message);
}

/** ¿Sigues esta saga? Sin sesión, no. */
export async function isFollowingCollection(collectionId: number): Promise<boolean> {
    const userId = getAuthId();
    if (!userId) return false;
    const { data, error } = await db().from('followed_collections').select('collection_id')
        .eq('user_id', userId).eq('collection_id', collectionId).maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
}

/** Las sagas que sigues, de la más reciente a la más antigua. Sin sesión, ninguna. */
export async function getFollowedCollections(): Promise<FollowedCollection[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<Row>((from, to) => db().from('followed_collections')
        .select('collection_id, name, poster_path, backdrop_path, added_at')
        .eq('user_id', userId).order('added_at', { ascending: false }).range(from, to));
    return rows.map(toItem);
}

/** Cuántas sagas sigues (contador «Sagas» de Mis listas, /api/lists/counts). Sin leer las filas. */
export async function countFollowedCollections(): Promise<number> {
    const userId = getAuthId();
    if (!userId) return 0;
    const { count, error } = await db().from('followed_collections')
        .select('collection_id', { count: 'exact', head: true }).eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
}
