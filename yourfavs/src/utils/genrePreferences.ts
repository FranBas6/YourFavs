import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getCurrentUid } from '../services/BD/shared/userScope';
import { getLibrarySnapshot } from '../services/BD/shared/librarySnapshot';
import { getUserTaste } from '../services/BD/profile/userTaste';
import { getCustomLists, getListItems } from '../services/BD/lists/customLists';
import { listRatings } from '../services/BD/lists/ratings';
import { getFirebaseTimestamp } from './constants/helpers/media-helpers';

// Listas fijas del usuario por tipo — para EXCLUIR de las recomendaciones todo lo
// que ya tiene guardado en cualquier lista (no solo los favoritos/semillas).

/** IDs (tmdb, string) de TODO lo que el usuario tiene en listas fijas + colecciones. */
async function collectLibraryIds(): Promise<{ movies: Set<string>; tv: Set<string> }> {
    const movies = new Set<string>();
    const tv = new Set<string>();
    try {
        // Listas fijas desde el snapshot compartido (no 11 lecturas sueltas).
        const snap = await getLibrarySnapshot();
        for (const arr of [snap.movFavs, snap.movPend, snap.movVistos, snap.movVerPronto, snap.movLike]) {
            for (const d of arr) movies.add(String(d.id));
        }
        for (const arr of [snap.tvFavs, snap.tvPend, snap.tvVistos, snap.tvSig, snap.tvLike, snap.tvVerPronto]) {
            for (const d of arr) tv.add(String(d.id));
        }
        // Items de colecciones personalizadas.
        const lists = await getCustomLists();
        const itemsPerList = await Promise.all(lists.map((l) => getListItems(l.id).catch(() => [])));
        itemsPerList.flat().forEach((it) => {
            (it.media_type === 'tv' ? tv : movies).add(String(it.tmdb_id));
        });
    } catch { /* exclusión best-effort */ }
    return { movies, tv };
}

/**
 * Preferencias de género y semillas del motor de recomendaciones.
 *
 * Qué siembra (decisión de Fran, 2026-10-27, que amplía la fase F «solo favoritos + onboarding»;
 * aquello dejaba fuera casi todo lo que el usuario añadía y «Para ti» no cambiaba nunca):
 *   · Favoritos (peso 3) · Me gusta (2) · títulos del onboarding (2) · nota ≥ 8 en cualquier lista (2)
 *   · Vistas de los últimos 90 días (1, decayendo hasta 0 al cumplir los 90).
 *   Pendientes, Ver pronto y Siguiendo NO siembran: son intención, no gusto. Solo excluyen.
 *   Lo reciente pesa más: cada semilla multiplica por hasta ×1.5 según lo nueva que sea (un favorito
 *   de esta semana manda sobre uno de hace dos años). Un título en varias señales se queda con la mayor.
 *
 * Los géneros del onboarding son un PRIOR que se diluye: pesan 4 cada uno con la biblioteca vacía y,
 * en cuanto hay semillas, como mucho el 30 % de su masa repartido entre ellos. Así mandan al empezar y
 * ceden cuando ya hay datos (antes eran 4 fijos y con pocas listas tapaban cualquier cambio).
 *
 * Cachés keyed por uid (cierra la tarea #100): cada usuario tiene su propio
 * cómputo en L1 (memoria) y L2 (Netlify Blobs); sin esto el taste de uno se
 * filtraría a las recos de otro al compartir Lambda.
 */
/** De dónde sale una semilla (para «porque te gustó X» y el panel de depuración). */
export type SeedWhy = 'fav' | 'like' | 'taste' | 'rated' | 'seen';

export interface Seed {
    id: string;
    /** Peso final, con el extra de recencia ya aplicado. */
    weight: number;
    why: SeedWhy;
    /** Cuándo entró la señal (ms); 0 si no se sabe (títulos del onboarding). */
    at: number;
    title?: string;
}

export interface GenrePrefs {
    movies: { topGenres: number[]; weighted: Record<number, number> };
    tv: { topGenres: number[]; weighted: Record<number, number> };
    libraryIds: { movies: Set<string>; tv: Set<string> };
    genresById: { movies: Record<string, number[]>; tv: Record<string, number[]> };
    /** Títulos de las semillas resueltos junto a sus géneros (los docs no los guardan). */
    titlesById: { movies: Record<string, string>; tv: Record<string, string> };
    /** Semillas ya listas para el motor, de mayor a menor peso; evita re-leer la biblioteca. */
    seeds: { movies: Seed[]; tv: Seed[] };
    /** Géneros explícitos del onboarding (para superficie/debug). */
    tasteGenres: number[];
    breakdown: {
        movies: Record<SeedWhy, number>;
        tv: Record<SeedWhy, number>;
    };
}

// Serializable: Sets convertidos a Arrays para JSON.stringify del Blob.
type SerializedGenrePrefs = Omit<GenrePrefs, 'libraryIds'> & {
    libraryIds: { movies: string[]; tv: string[] };
};

const BLOB_KEY = 'genrePrefs_v7';        // v7: cupo de semillas por señal; v6: semillas = favs + me gusta + onboarding + notas ≥ 8 + vistas recientes, con recencia; v5 exclusión = todas las listas
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

const W_FAV = 3;
const W_LIKE = 2;
const W_TASTE_TITLE = 2;
const W_RATED = 2;
const W_SEEN = 1;
const RATED_MIN = 8;
const SEEN_WINDOW_DAYS = 90;
/** Hasta ×1.5 para lo añadido hoy; sin extra a partir de un año. */
const RECENCY_BONUS = 0.5;
const RECENCY_DAYS = 365;
const TASTE_GENRE_WEIGHT = 4;
const TASTE_PRIOR_SHARE = 0.3;
/**
 * Semillas que se resuelven contra TMDB (una petición por título sin géneros guardados), con cupo
 * por señal: por peso a secas, 179 favoritas se comían los 40 huecos y Me gusta, las notas y las vistas
 * recientes no llegaban ni a competir (visto en prod, 2026-10-27). Dentro de cada señal, las de más
 * peso (= las más recientes); el onboarding entra entero (≤ 10).
 */
const SEED_QUOTA: Record<SeedWhy, number> = { fav: 20, like: 10, rated: 6, seen: 6, taste: 10 };
const TOP_N_MOVIES = 5;
const TOP_N_TV = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mete una señal en el mapa de semillas: si el título ya estaba, se queda la de mayor peso. */
function mergeSignal(
    map: Map<string, Seed>,
    items: { id: string | number; added_at?: unknown; title?: string }[],
    why: SeedWhy,
    base: number,
    now: number,
    scale: (ageDays: number) => number = () => 1,
) {
    for (const it of items) {
        const id = String(it.id);
        const at = getFirebaseTimestamp(it.added_at) || 0;
        const ageDays = at ? Math.max(0, (now - at) / DAY_MS) : RECENCY_DAYS;
        const s = scale(ageDays);
        if (s <= 0) continue;
        const weight = base * s * (1 + RECENCY_BONUS * Math.max(0, 1 - ageDays / RECENCY_DAYS));
        const cur = map.get(id);
        if (cur && cur.weight >= weight) continue;
        map.set(id, { id, weight, why, at, ...(it.title ? { title: it.title } : {}) });
    }
}

/** Las semillas de un tipo: favoritos, me gusta, onboarding, notas altas y vistas recientes. */
function collectSeeds(
    lists: { favs: any[]; like: any[]; seen: any[]; rated: any[]; taste: { id: number; title: string }[] },
    now: number,
): Seed[] {
    const map = new Map<string, Seed>();
    mergeSignal(map, lists.favs, 'fav', W_FAV, now);
    mergeSignal(map, lists.like, 'like', W_LIKE, now);
    mergeSignal(map, lists.taste, 'taste', W_TASTE_TITLE, now);
    mergeSignal(map, lists.rated, 'rated', W_RATED, now);
    mergeSignal(map, lists.seen, 'seen', W_SEEN, now, (age) => Math.max(0, 1 - age / SEEN_WINDOW_DAYS));
    return Array.from(map.values()).sort((a, b) => b.weight - a.weight);
}

/**
 * Resuelve los géneros (IDs TMDB) de cada semilla. Si el doc ya los trae
 * (los favs de PELÍCULAS guardan `genre_ids`), se usan directos → 0 fetch.
 * Solo se pide a TMDB lo que falta: títulos del onboarding y favs de SERIES
 * (sus docs no guardan géneros). Esto recorta drásticamente las llamadas en frío.
 */
async function resolveGenres(
    seeds: Seed[],
    preGenres: Map<string, number[]>,
    mediaType: 'movie' | 'tv',
): Promise<{ weight: number; genres: number[]; title?: string }[]> {
    return processBatch(
        seeds,
        async (s: Seed) => {
            const pre = preGenres.get(s.id);
            if (pre && pre.length) return { weight: s.weight, genres: pre, title: s.title };
            try {
                const d = await tmdbFetch<any>(`/${mediaType}/${s.id}`);
                const title = s.title || (mediaType === 'movie' ? d?.title : d?.name) || undefined;
                return { weight: s.weight, genres: (d?.genres || []).map((g: any) => g.id as number), title };
            } catch { return { weight: s.weight, genres: [] as number[], title: s.title }; }
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
    // El prior del onboarding: 4 por género con la biblioteca vacía; con semillas, como mucho el
    // 30 % de su masa repartido entre los géneros elegidos (así se diluye conforme hay datos).
    const mass = entries.reduce((sum, e) => sum + e.weight * e.genres.length, 0);
    const prior = mass > 0 && tasteGenres.length
        ? Math.min(TASTE_GENRE_WEIGHT, Math.max(1, (TASTE_PRIOR_SHARE * mass) / tasteGenres.length))
        : TASTE_GENRE_WEIGHT;
    for (const g of tasteGenres) weighted[g] = (weighted[g] || 0) + prior;

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

    const [snap, taste, ratings] = await Promise.all([
        getLibrarySnapshot(), getUserTaste(), listRatings().catch(() => []),
    ]);
    const { movFavs, tvFavs } = snap;
    // Las notas: el almacén canónico (`ratings`, con fecha) más las copiadas en las listas.
    const rated = (kind: 'movie' | 'tv', docs: any[]) => [
        ...ratings.filter((r) => r.media_type === kind && r.score >= RATED_MIN).map((r) => ({ id: r.tmdb_id, added_at: r.updated_at })),
        ...docs.filter((d) => Number(d?.rating) >= RATED_MIN),
    ];
    // Géneros del onboarding, ya partidos por tipo (F.7). Retrocompat: docs
    // pre-F.7 traen `genres` (IDs de cine) → alimentan cine; TV tira de favoritos.
    const movieTasteGenres = taste?.movieGenres ?? taste?.genres ?? [];
    const tvTasteGenres = taste?.tvGenres ?? [];
    const tasteTitles = taste?.titles ?? [];
    const tasteMovies = tasteTitles.filter((t) => t.media_type === 'movie');
    const tasteTv = tasteTitles.filter((t) => t.media_type === 'tv');

    // Semillas por tipo (ver cabecera). Solo las del cupo de cada señal van a TMDB a por sus
    // géneros: con bibliotecas grandes, el resto no iba a entrar de todos modos.
    const movieAllSeeds = collectSeeds({
        favs: movFavs, like: snap.movLike, seen: snap.movVistos, taste: tasteMovies,
        rated: rated('movie', [...movFavs, ...snap.movLike, ...snap.movVistos, ...snap.movPend, ...snap.movVerPronto]),
    }, now);
    const tvAllSeeds = collectSeeds({
        favs: tvFavs, like: snap.tvLike, seen: snap.tvVistos, taste: tasteTv,
        rated: rated('tv', [...tvFavs, ...snap.tvLike, ...snap.tvVistos, ...snap.tvSig, ...snap.tvPend, ...snap.tvVerPronto, ...snap.tvAbandonadas]),
    }, now);
    const withQuota = (seeds: Seed[]) => {
        const left = { ...SEED_QUOTA };
        return seeds.filter((s) => left[s.why]-- > 0);
    };
    const movieSeeds = withQuota(movieAllSeeds);
    const tvSeeds = withQuota(tvAllSeeds);

    // Exclusión de recomendaciones: TODO lo que el usuario ya tiene en cualquier
    // lista (fijas + colecciones) + las semillas. Esto solo evita recomendar lo ya guardado.
    const libraryIds = await collectLibraryIds();
    movieAllSeeds.forEach((s) => libraryIds.movies.add(s.id));
    tvAllSeeds.forEach((s) => libraryIds.tv.add(s.id));

    // Géneros ya guardados en los docs (hoy ninguno los trae; se piden a TMDB, y de paso el título).
    const movieDocGenres = docGenreMap(movFavs as any[]);
    const tvDocGenres = docGenreMap(tvFavs as any[]);

    const [movieDetails, tvDetails] = await Promise.all([
        resolveGenres(movieSeeds, movieDocGenres, 'movie'),
        resolveGenres(tvSeeds, tvDocGenres, 'tv'),
    ]);

    const movieGenresById: Record<string, number[]> = {};
    const movieTitles: Record<string, string> = {};
    movieSeeds.forEach((s, i) => {
        movieGenresById[s.id] = movieDetails[i]?.genres || [];
        if (movieDetails[i]?.title) movieTitles[s.id] = movieDetails[i].title!;
    });
    const tvGenresById: Record<string, number[]> = {};
    const tvTitles: Record<string, string> = {};
    tvSeeds.forEach((s, i) => {
        tvGenresById[s.id] = tvDetails[i]?.genres || [];
        if (tvDetails[i]?.title) tvTitles[s.id] = tvDetails[i].title!;
    });

    const count = (seeds: Seed[]): Record<SeedWhy, number> => {
        const c: Record<SeedWhy, number> = { fav: 0, like: 0, taste: 0, rated: 0, seen: 0 };
        for (const s of seeds) c[s.why]++;
        return c;
    };

    const data: GenrePrefs = {
        movies: aggregateGenres(movieDetails, TOP_N_MOVIES, movieTasteGenres),
        tv: aggregateGenres(tvDetails, TOP_N_TV, tvTasteGenres),
        libraryIds,
        genresById: { movies: movieGenresById, tv: tvGenresById },
        titlesById: { movies: movieTitles, tv: tvTitles },
        seeds: { movies: movieSeeds, tv: tvSeeds },
        tasteGenres: movieTasteGenres,
        breakdown: { movies: count(movieAllSeeds), tv: count(tvAllSeeds) },
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
