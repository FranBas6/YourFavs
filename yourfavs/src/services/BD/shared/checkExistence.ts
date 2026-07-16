import type { DocumentSnapshot } from "firebase-admin/firestore";
import { userDoc, getCurrentUid } from "./userScope";

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies', 'MoviesViendo'] as const;
const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto', 'SeriesAbandonadas'] as const;

export type MovieCollection = typeof MOVIE_COLLECTIONS[number];
export type SerieCollection = typeof SERIE_COLLECTIONS[number];

export interface MediaExistenceResult<K extends string> {
    exists: Record<K, boolean>;
    snaps: Record<K, DocumentSnapshot>;
    /** Primera opinión encontrada en cualquier colección (para sidebar "Tu opinión"). */
    opinion: string;
    /** Primer rating 1-10 encontrado en cualquier colección (para sidebar "Tu nota"). */
    rating: number | null;
}

export async function checkMediaExistence(
    mediaType: 'movie',
    id: string
): Promise<MediaExistenceResult<MovieCollection>>;
export async function checkMediaExistence(
    mediaType: 'serie',
    id: string
): Promise<MediaExistenceResult<SerieCollection>>;
export async function checkMediaExistence(
    mediaType: 'movie' | 'serie',
    id: string
): Promise<MediaExistenceResult<string>> {
    const collections: readonly string[] = mediaType === 'movie' ? MOVIE_COLLECTIONS : SERIE_COLLECTIONS;

    const exists: Record<string, boolean> = {};
    const snapsMap: Record<string, DocumentSnapshot> = {};
    let opinion = '';
    let rating: number | null = null;

    // Invitado: nada existe (la ficha mostrará los botones en estado "no guardado").
    if (!getCurrentUid()) {
        for (const col of collections) exists[col] = false;
        return { exists, snaps: snapsMap, opinion, rating };
    }

    const snaps = await Promise.all(collections.map((col) => userDoc(col, id).get()));
    for (let i = 0; i < collections.length; i++) {
        const col = collections[i];
        exists[col] = snaps[i].exists;
        snapsMap[col] = snaps[i];
        if (snaps[i].exists) {
            const data = snaps[i].data();
            if (!opinion && data?.opinion) opinion = data.opinion;
            if (rating === null && typeof data?.rating === 'number') rating = data.rating;
        }
    }
    return { exists, snaps: snapsMap, opinion, rating };
}
