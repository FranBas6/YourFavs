import { doc, getDoc, type DocumentSnapshot } from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies'] as const;
const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto'] as const;

export type MovieCollection = typeof MOVIE_COLLECTIONS[number];
export type SerieCollection = typeof SERIE_COLLECTIONS[number];

export interface MediaExistenceResult<K extends string> {
    exists: Record<K, boolean>;
    snaps: Record<K, DocumentSnapshot>;
    /** Primera opinión encontrada en cualquier colección (para sidebar "Tu opinión"). */
    opinion: string;
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
    const snaps = await Promise.all(collections.map((col) => getDoc(doc(db, col, id))));

    const exists: Record<string, boolean> = {};
    const snapsMap: Record<string, DocumentSnapshot> = {};
    let opinion = '';
    for (let i = 0; i < collections.length; i++) {
        const col = collections[i];
        exists[col] = snaps[i].exists();
        snapsMap[col] = snaps[i];
        if (!opinion && snaps[i].exists()) {
            const data = snaps[i].data();
            if (data?.opinion) opinion = data.opinion;
        }
    }
    return { exists, snaps: snapsMap, opinion };
}
