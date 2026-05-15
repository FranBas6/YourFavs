import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import {
    getMovieFav, getMoviesPendientes, getMoviesVistas, getLikedMovies, getMoviesVerPronto
} from '../services/BD/movies/yourfavsMovie';
import {
    getSerieFav, getSeriesPendientes, getSeriesVistas, getSeriesSiguiendo,
    getLikedSeries, getSeriesVerPronto
} from '../services/BD/series/yourfavsSerie';

export interface GenrePrefs {
    movies: { topGenres: number[]; weighted: Record<number, number> };
    tv: { topGenres: number[]; weighted: Record<number, number> };
    libraryIds: { movies: Set<string>; tv: Set<string> };
    genresById: { movies: Record<string, number[]>; tv: Record<string, number[]> };
    breakdown: {
        movies: { favs: number; like: number; vistos: number; pendientes: number; verpronto: number };
        tv: { favs: number; siguiendo: number; like: number; vistos: number; pendientes: number; verpronto: number };
    };
}

// Serializable: Sets convertidos a Arrays para JSON.stringify del Blob.
type SerializedGenrePrefs = Omit<GenrePrefs, 'libraryIds'> & {
    libraryIds: { movies: string[]; tv: string[] };
};

const BLOB_KEY = 'genrePrefs_v3';
const L1_TTL_MS = 30 * 60 * 1000;       // 30min en memoria de la Lambda
const L2_TTL_MS = 6 * 60 * 60 * 1000;   // 6h en Netlify Blobs
let cache: { data: GenrePrefs; expires: number } | null = null;

function deserialize(s: SerializedGenrePrefs): GenrePrefs {
    return {
        ...s,
        libraryIds: {
            movies: new Set(s.libraryIds.movies),
            tv: new Set(s.libraryIds.tv),
        },
    };
}

function serialize(p: GenrePrefs): SerializedGenrePrefs {
    return {
        ...p,
        libraryIds: {
            movies: Array.from(p.libraryIds.movies),
            tv: Array.from(p.libraryIds.tv),
        },
    };
}

const MOVIE_WEIGHTS = { favs: 2, like: 1.5, vistos: 1, pendientes: 0.5, verpronto: 0.5 };
const TV_WEIGHTS    = { favs: 2, siguiendo: 1.5, like: 1.5, vistos: 1, pendientes: 0.5, verpronto: 0.5 };
// Pelis: 5 top (Aventura, Acción, SciFi, Comedia, Fantasía es señal sana).
// Series: 3 top (puesto 4-5 metía Animación → anime deportivo nicho monopoliza).
const TOP_N_MOVIES = 5;
const TOP_N_TV = 3;

function mergeMaxWeight(map: Map<string, number>, items: { id: string }[], weight: number) {
    for (const it of items) {
        const cur = map.get(it.id) ?? 0;
        if (weight > cur) map.set(it.id, weight);
    }
}

function aggregateGenres(entries: { weight: number; genres: number[] }[], topN: number) {
    const weighted: Record<number, number> = {};
    for (const e of entries) {
        for (const g of e.genres) weighted[g] = (weighted[g] || 0) + e.weight;
    }
    const topGenres = Object.entries(weighted)
        .sort(([, a], [, b]) => b - a)
        .slice(0, topN)
        .map(([id]) => Number(id));
    return { topGenres, weighted };
}

export async function calculateGenrePreferences(): Promise<GenrePrefs> {
    const now = Date.now();
    if (cache && cache.expires > now) return cache.data;

    // L2: Netlify Blobs (sobrevive a cold starts de Lambda).
    const cachedL2 = await getCached<SerializedGenrePrefs>(BLOB_KEY);
    if (cachedL2) {
        const data = deserialize(cachedL2);
        cache = { data, expires: now + L1_TTL_MS };
        return data;
    }

    const [movFavs, movPend, movVistos, movLike, movVerPronto] = await Promise.all([
        getMovieFav(), getMoviesPendientes(), getMoviesVistas(), getLikedMovies(), getMoviesVerPronto()
    ]);
    const [tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto] = await Promise.all([
        getSerieFav(), getSeriesPendientes(), getSeriesVistas(),
        getSeriesSiguiendo(), getLikedSeries(), getSeriesVerPronto()
    ]);

    const movieMap = new Map<string, number>();
    mergeMaxWeight(movieMap, movFavs as any, MOVIE_WEIGHTS.favs);
    mergeMaxWeight(movieMap, movLike as any, MOVIE_WEIGHTS.like);
    mergeMaxWeight(movieMap, movVistos as any, MOVIE_WEIGHTS.vistos);
    mergeMaxWeight(movieMap, movPend as any, MOVIE_WEIGHTS.pendientes);
    mergeMaxWeight(movieMap, movVerPronto as any, MOVIE_WEIGHTS.verpronto);

    const tvMap = new Map<string, number>();
    mergeMaxWeight(tvMap, tvFavs as any, TV_WEIGHTS.favs);
    mergeMaxWeight(tvMap, tvSig as any, TV_WEIGHTS.siguiendo);
    mergeMaxWeight(tvMap, tvLike as any, TV_WEIGHTS.like);
    mergeMaxWeight(tvMap, tvVistos as any, TV_WEIGHTS.vistos);
    mergeMaxWeight(tvMap, tvPend as any, TV_WEIGHTS.pendientes);
    mergeMaxWeight(tvMap, tvVerPronto as any, TV_WEIGHTS.verpronto);

    const movieEntries = Array.from(movieMap.entries());
    const tvEntries = Array.from(tvMap.entries());

    const [movieDetails, tvDetails] = await Promise.all([
        processBatch(
            movieEntries,
            async ([id, weight]: [string, number]) => {
                try {
                    const d = await tmdbFetch<any>(`/movie/${id}`);
                    return { weight, genres: (d?.genres || []).map((g: any) => g.id as number) };
                } catch { return { weight, genres: [] as number[] }; }
            },
            10
        ),
        processBatch(
            tvEntries,
            async ([id, weight]: [string, number]) => {
                try {
                    const d = await tmdbFetch<any>(`/tv/${id}`);
                    return { weight, genres: (d?.genres || []).map((g: any) => g.id as number) };
                } catch { return { weight, genres: [] as number[] }; }
            },
            10
        ),
    ]);

    const movieGenresById: Record<string, number[]> = {};
    movieEntries.forEach(([id], i) => { movieGenresById[id] = movieDetails[i]?.genres || []; });
    const tvGenresById: Record<string, number[]> = {};
    tvEntries.forEach(([id], i) => { tvGenresById[id] = tvDetails[i]?.genres || []; });

    const data: GenrePrefs = {
        movies: aggregateGenres(movieDetails, TOP_N_MOVIES),
        tv: aggregateGenres(tvDetails, TOP_N_TV),
        libraryIds: {
            movies: new Set(movieEntries.map(([id]) => id)),
            tv: new Set(tvEntries.map(([id]) => id)),
        },
        genresById: { movies: movieGenresById, tv: tvGenresById },
        breakdown: {
            movies: {
                favs: movFavs.length, like: movLike.length, vistos: movVistos.length,
                pendientes: movPend.length, verpronto: movVerPronto.length,
            },
            tv: {
                favs: tvFavs.length, siguiendo: tvSig.length, like: tvLike.length,
                vistos: tvVistos.length, pendientes: tvPend.length, verpronto: tvVerPronto.length,
            },
        },
    };

    cache = { data, expires: now + L1_TTL_MS };
    // L2 write fire-and-forget (no bloquear la respuesta esperando al Blob)
    setCached(BLOB_KEY, serialize(data), L2_TTL_MS).catch(() => {});
    return data;
}

export function invalidateGenrePreferencesCache() {
    cache = null;
    // L2 invalidación también
    invalidateCached(BLOB_KEY).catch(() => {});
}
