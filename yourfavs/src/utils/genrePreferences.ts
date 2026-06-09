import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getCurrentUid } from '../services/BD/shared/userScope';
import { getMovieFav } from '../services/BD/movies/yourfavsMovie';
import { getSerieFav } from '../services/BD/series/yourfavsSerie';
import { getUserTaste } from '../services/BD/profile/userTaste';

/**
 * Preferencias de género (Fase F · modelo simplificado).
 *
 * Las recomendaciones se construyen SOLO desde dos señales explícitas:
 *   1) los gustos del onboarding (taste: géneros + títulos), y
 *   2) los FAVORITOS de pelis y series.
 * Se dejaron de mezclar el resto de listas (me gusta, vistos, siguiendo,
 * pendientes, ver-pronto, alto-rating): "lo que sigo" ≠ "lo que le digo al
 * sistema que me gusta". Menos ruido, más fiel a la intención del usuario.
 *
 * Cachés keyed por uid (cierra la tarea #100): cada usuario tiene su propio
 * cómputo en L1 (memoria) y L2 (Netlify Blobs); sin esto el taste de uno se
 * filtraría a las recos de otro al compartir Lambda.
 */
export interface GenrePrefs {
    movies: { topGenres: number[]; weighted: Record<number, number> };
    tv: { topGenres: number[]; weighted: Record<number, number> };
    libraryIds: { movies: Set<string>; tv: Set<string> };
    genresById: { movies: Record<string, number[]>; tv: Record<string, number[]> };
    /** Semillas (id → peso) ya listas para el motor; evita re-leer favs/taste. */
    seeds: { movies: Array<[string, number]>; tv: Array<[string, number]> };
    /** Géneros explícitos del onboarding (para superficie/debug). */
    tasteGenres: number[];
    breakdown: {
        movies: { favs: number; taste: number };
        tv: { favs: number; taste: number };
    };
}

// Serializable: Sets convertidos a Arrays para JSON.stringify del Blob.
type SerializedGenrePrefs = Omit<GenrePrefs, 'libraryIds'> & {
    libraryIds: { movies: string[]; tv: string[] };
};

const BLOB_KEY = 'genrePrefs_v4';        // v4: modelo simplificado favs+taste, keyed por uid
const L1_TTL_MS = 30 * 60 * 1000;       // 30min en memoria de la Lambda
const L2_TTL_MS = 6 * 60 * 60 * 1000;   // 6h en Netlify Blobs
const l1 = new Map<string, { data: GenrePrefs; expires: number }>();

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

const W_FAV = 2;            // un favorito
const W_TASTE_TITLE = 2.5; // un título elegido en el onboarding (señal explícita) pesa algo más
const TASTE_GENRE_WEIGHT = 4; // peso por género explícito del onboarding en el mapa ponderado
const TOP_N_MOVIES = 5;
const TOP_N_TV = 3;

function mergeMaxWeight(map: Map<string, number>, items: { id: string | number }[], weight: number) {
    for (const it of items) {
        const id = String(it.id);
        const cur = map.get(id) ?? 0;
        if (weight > cur) map.set(id, weight);
    }
}

/**
 * Resuelve los géneros (IDs TMDB) de cada semilla. Si el doc ya los trae
 * (los favs de PELÍCULAS guardan `genre_ids`), se usan directos → 0 fetch.
 * Solo se pide a TMDB lo que falta: títulos del onboarding y favs de SERIES
 * (sus docs no guardan géneros). Esto recorta drásticamente las llamadas en frío.
 */
async function resolveGenres(
    entries: Array<[string, number]>,
    preGenres: Map<string, number[]>,
    mediaType: 'movie' | 'tv',
): Promise<{ weight: number; genres: number[] }[]> {
    return processBatch(
        entries,
        async ([id, weight]: [string, number]) => {
            const pre = preGenres.get(id);
            if (pre && pre.length) return { weight, genres: pre };
            try {
                const d = await tmdbFetch<any>(`/${mediaType}/${id}`);
                return { weight, genres: (d?.genres || []).map((g: any) => g.id as number) };
            } catch { return { weight, genres: [] as number[] }; }
        },
        10
    );
}

/** Extrae genre_ids numéricos guardados en los docs (favs de pelis los traen). */
function docGenreMap(items: any[]): Map<string, number[]> {
    const m = new Map<string, number[]>();
    for (const it of items) {
        const g = (it?.genres || []).filter((x: any) => typeof x === 'number') as number[];
        if (g.length) m.set(String(it.id), g);
    }
    return m;
}

function aggregateGenres(
    entries: { weight: number; genres: number[] }[],
    topN: number,
    tasteGenres: number[],
) {
    const weighted: Record<number, number> = {};
    for (const e of entries) {
        for (const g of e.genres) weighted[g] = (weighted[g] || 0) + e.weight;
    }
    // Inyectar los géneros explícitos del onboarding con peso fuerte → dominan topGenres.
    for (const g of tasteGenres) weighted[g] = (weighted[g] || 0) + TASTE_GENRE_WEIGHT;

    const topGenres = Object.entries(weighted)
        .sort(([, a], [, b]) => b - a)
        .slice(0, topN)
        .map(([id]) => Number(id));
    return { topGenres, weighted };
}

export async function calculateGenrePreferences(): Promise<GenrePrefs> {
    const uidKey = getCurrentUid() ?? 'guest';
    const blobKey = `${BLOB_KEY}:${uidKey}`;
    const now = Date.now();

    const hit = l1.get(uidKey);
    if (hit && hit.expires > now) return hit.data;

    // L2: Netlify Blobs (sobrevive a cold starts de Lambda).
    const cachedL2 = await getCached<SerializedGenrePrefs>(blobKey);
    if (cachedL2) {
        const data = deserialize(cachedL2);
        l1.set(uidKey, { data, expires: now + L1_TTL_MS });
        return data;
    }

    const [movFavs, tvFavs, taste] = await Promise.all([
        getMovieFav(), getSerieFav(), getUserTaste(),
    ]);
    // Géneros del onboarding, ya partidos por tipo (F.7). Retrocompat: docs
    // pre-F.7 traen `genres` (IDs de cine) → alimentan cine; TV tira de favoritos.
    const movieTasteGenres = taste?.movieGenres ?? taste?.genres ?? [];
    const tvTasteGenres = taste?.tvGenres ?? [];
    const tasteTitles = taste?.titles ?? [];
    const tasteMovies = tasteTitles.filter((t) => t.media_type === 'movie');
    const tasteTv = tasteTitles.filter((t) => t.media_type === 'tv');

    // Semillas: favoritos + títulos del onboarding (dedup por id, peso máximo).
    const movieMap = new Map<string, number>();
    mergeMaxWeight(movieMap, movFavs as any, W_FAV);
    mergeMaxWeight(movieMap, tasteMovies, W_TASTE_TITLE);

    const tvMap = new Map<string, number>();
    mergeMaxWeight(tvMap, tvFavs as any, W_FAV);
    mergeMaxWeight(tvMap, tasteTv, W_TASTE_TITLE);

    const movieEntries = Array.from(movieMap.entries());
    const tvEntries = Array.from(tvMap.entries());

    // Géneros ya guardados en los docs (pelis sí; series no → se pedirán a TMDB).
    const movieDocGenres = docGenreMap(movFavs as any[]);
    const tvDocGenres = docGenreMap(tvFavs as any[]);

    const [movieDetails, tvDetails] = await Promise.all([
        resolveGenres(movieEntries, movieDocGenres, 'movie'),
        resolveGenres(tvEntries, tvDocGenres, 'tv'),
    ]);

    const movieGenresById: Record<string, number[]> = {};
    movieEntries.forEach(([id], i) => { movieGenresById[id] = movieDetails[i]?.genres || []; });
    const tvGenresById: Record<string, number[]> = {};
    tvEntries.forEach(([id], i) => { tvGenresById[id] = tvDetails[i]?.genres || []; });

    const data: GenrePrefs = {
        movies: aggregateGenres(movieDetails, TOP_N_MOVIES, movieTasteGenres),
        tv: aggregateGenres(tvDetails, TOP_N_TV, tvTasteGenres),
        libraryIds: {
            movies: new Set(movieEntries.map(([id]) => id)),
            tv: new Set(tvEntries.map(([id]) => id)),
        },
        genresById: { movies: movieGenresById, tv: tvGenresById },
        seeds: { movies: movieEntries, tv: tvEntries },
        tasteGenres: movieTasteGenres,
        breakdown: {
            movies: { favs: movFavs.length, taste: tasteMovies.length },
            tv: { favs: tvFavs.length, taste: tasteTv.length },
        },
    };

    l1.set(uidKey, { data, expires: now + L1_TTL_MS });
    // L2 write fire-and-forget (no bloquear la respuesta esperando al Blob)
    setCached(blobKey, serialize(data), L2_TTL_MS).catch(() => {});
    return data;
}

export function invalidateGenrePreferencesCache() {
    const uidKey = getCurrentUid() ?? 'guest';
    l1.delete(uidKey);
    invalidateCached(`${BLOB_KEY}:${uidKey}`).catch(() => {});
}
