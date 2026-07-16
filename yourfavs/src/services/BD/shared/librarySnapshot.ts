import { getCurrentUid } from './userScope';
import {
    getMovieFav, getMoviesPendientes, getMoviesVistas, getLikedMovies, getMoviesVerPronto
} from '../movies/yourfavsMovie';
import {
    getSerieFav, getSeriesPendientes, getSeriesVistas, getSeriesSiguiendo,
    getLikedSeries, getSeriesVerPronto, getSeriesAbandonadas
} from '../series/yourfavsSerie';

/**
 * Snapshot compartido de la biblioteca (optimización de lecturas Firestore).
 *
 * Antes, cada feature pesada (`yearStats`, `personalIndex`, `topActorsLibrary`,
 * `activityFeed`) leía por su cuenta las 11 colecciones de listas → en una sesión
 * de pruebas la biblioteca se leía 4× o más. Ahora todas piden ESTE snapshot, que
 * lee las 11 colecciones UNA vez y las cachea en memoria por uid (TTL corto).
 * Reduce mucho las lecturas repetidas (sobre todo en proceso caliente / prod).
 *
 * TTL deliberadamente corto (5 min): es un backstop; las mutaciones de listas
 * invalidan el snapshot al instante (ver handlers add/remove). Las features
 * mantienen además su propia caché de RESULTADO (1h), así que en caliente ni
 * siquiera llegan aquí.
 */

const TTL_MS = 5 * 60 * 1000;

export interface LibrarySnapshot {
    movFavs: any[]; movPend: any[]; movVistos: any[]; movLike: any[]; movVerPronto: any[];
    tvFavs: any[]; tvPend: any[]; tvVistos: any[]; tvSig: any[]; tvLike: any[]; tvVerPronto: any[]; tvAbandonadas: any[];
}

const EMPTY: LibrarySnapshot = {
    movFavs: [], movPend: [], movVistos: [], movLike: [], movVerPronto: [],
    tvFavs: [], tvPend: [], tvVistos: [], tvSig: [], tvLike: [], tvVerPronto: [], tvAbandonadas: [],
};

const cache = new Map<string, { data: LibrarySnapshot; expires: number }>();

export function invalidateLibrarySnapshot(uid?: string) {
    if (uid) cache.delete(uid); else cache.clear();
}

export async function getLibrarySnapshot(): Promise<LibrarySnapshot> {
    const uid = getCurrentUid();
    if (!uid) return EMPTY;
    const now = Date.now();
    const cached = cache.get(uid);
    if (cached && cached.expires > now) return cached.data;

    const [movFavs, movPend, movVistos, movLike, movVerPronto] = await Promise.all([
        getMovieFav(), getMoviesPendientes(), getMoviesVistas(), getLikedMovies(), getMoviesVerPronto()
    ]);
    const [tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto, tvAbandonadas] = await Promise.all([
        getSerieFav(), getSeriesPendientes(), getSeriesVistas(),
        getSeriesSiguiendo(), getLikedSeries(), getSeriesVerPronto(), getSeriesAbandonadas()
    ]);

    const data: LibrarySnapshot = {
        movFavs, movPend, movVistos, movLike, movVerPronto,
        tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto, tvAbandonadas,
    };
    cache.set(uid, { data, expires: now + TTL_MS });
    return data;
}
