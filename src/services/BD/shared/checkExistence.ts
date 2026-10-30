import { titleMembership } from "./library";

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies', 'MoviesViendo'] as const;
const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto', 'SeriesAbandonadas'] as const;

export type MovieCollection = typeof MOVIE_COLLECTIONS[number];
export type SerieCollection = typeof SERIE_COLLECTIONS[number];

export interface MediaExistenceResult<K extends string> {
    exists: Record<K, boolean>;
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

    // Una sola consulta por todas las listas (en Firestore era una lectura por colección).
    // Invitado: titleMembership devuelve vacío → nada existe (botones en estado "no guardado").
    const rows = await titleMembership(mediaType === 'movie' ? 'movie' : 'tv', id);

    const exists: Record<string, boolean> = {};
    let opinion = '';
    let rating: number | null = null;
    for (const col of collections) {
        const row = rows.get(col);
        exists[col] = Boolean(row);
        if (!row) continue;
        if (!opinion && row.opinion) opinion = row.opinion;
        if (rating === null && row.rating !== null) rating = Number(row.rating);
    }
    return { exists, opinion, rating };
}
