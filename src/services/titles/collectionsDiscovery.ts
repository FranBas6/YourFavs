import { tmdbFetchList } from "../tmdb/tmdbClient";
import { getTitleDetails } from "../tmdb/tmdbTitleCache";
import { processBatch } from "../../utils/core/processBatch";
import { getMovieCollectionInfo, type MovieCollectionInfo } from "../movies/movieDetail";
import { getLibrarySnapshot } from "../library/librarySnapshot";
import { getCurrentUid, getCurrentLanguage } from "../db/userScope";
import { getCached, setCached, invalidateCached } from "../cache/recsBlobCache";
import { onLibraryChange } from '../library/libraryChanges';
import { toTimestamp } from "../../utils/titles/mediaHelpers";
import { SEED_COLLECTION_IDS } from "../../utils/catalog/featuredCollections";

interface CacheEntry<T> { data: T; expires: number }
const POPULAR_TTL_MS = 60 * 60 * 1000;
const USER_TTL_MS = 5 * 60 * 1000;
const MAX_USER_MOVIES = 50;

let popularCache: CacheEntry<MovieCollectionInfo[]> | null = null;
// Por uid: son las sagas de TU biblioteca. Con una única variable, la instancia caliente
// le servía a cualquier usuario las del último que entró.
const userCache = new Map<string, CacheEntry<MovieCollectionInfo[]>>();
// Tus sagas se vacían solas cuando cambian tus listas (services/library/libraryChanges.ts).
onLibraryChange(['lists'], () => invalidateUserCollectionsCache());

/**
 * Saga de cada película. QA 7.1: las fichas salen de `getTitleDetails` (tabla `tmdb_cache`, compartida
 * entre instancias y guardada solo mientras TMDB la da por buena), no de un `/movie/{id}` por película
 * en cada instancia nueva: era la mayor parte de las ~160 llamadas de /catalogo/colecciones.
 */
async function extractCollectionIds(movieIds: string[]): Promise<number[]> {
    const details = await getTitleDetails('movie', movieIds).catch(() => [] as any[]);
    const unique = new Set<number>();
    for (const d of details) {
        const id = d?.belongs_to_collection?.id;
        if (typeof id === 'number') unique.add(id);
    }
    return Array.from(unique);
}

async function loadCollections(ids: number[]): Promise<MovieCollectionInfo[]> {
    const results = await processBatch(ids, (id: number) => getMovieCollectionInfo(id), 6);
    return results.filter((c): c is MovieCollectionInfo => c !== null);
}

/** QA 7.1: la lista montada también en Blobs (la misma hora que en memoria), para que una instancia
 *  nueva la lea de una vez en vez de reconstruirla saga a saga. Lleva el idioma: los nombres cambian. */
const popularKey = () => `collections/popular_v1/${getCurrentLanguage()}`;

export async function getPopularCollections(): Promise<MovieCollectionInfo[]> {
    if (popularCache && popularCache.expires > Date.now()) return popularCache.data;
    const shared = await getCached<MovieCollectionInfo[]>(popularKey());
    if (shared?.length) {
        popularCache = { data: shared, expires: Date.now() + POPULAR_TTL_MS };
        return shared;
    }
    try {
        // Estrategia híbrida: semilla curada + descubrimiento dinámico
        // Dinámico: top_rated + discover por vote_count (anclas de franquicia más valoradas)
        const [tr1, tr2, mostVoted] = await Promise.all([
            tmdbFetchList<any>('/movie/top_rated', { page: '1' }),
            tmdbFetchList<any>('/movie/top_rated', { page: '2' }),
            tmdbFetchList<any>('/discover/movie', { sort_by: 'vote_count.desc', 'vote_count.gte': '5000', page: '1' }),
        ]);

        const uniqueMovieIds = new Set<string>();
        for (const m of [...tr1, ...tr2, ...mostVoted]) {
            uniqueMovieIds.add(m.id.toString());
        }
        const movieIds = Array.from(uniqueMovieIds).slice(0, 60);

        // 1. Extraer collection IDs descubiertas
        const discoveredIds = await extractCollectionIds(movieIds);

        // 2. Unir con semilla (dedup)
        const allIds = new Set<number>([...SEED_COLLECTION_IDS, ...discoveredIds]);

        // 3. Fetch detalles de todas
        const collections = await loadCollections(Array.from(allIds));

        // 4. Filtros + ordenación:
        //    - Siempre ≥3 pelis en la saga
        //    - Seeds (curadas) pasan siempre con ≥2 partes (confiamos en la lista; el ≥2
        //      solo descarta un ID roto/vacío accidental).
        //    - Descubiertas (complemento menor): ≥3 partes Y suma vote_count ≥ 15k —
        //      umbral alto a propósito porque la base ya la dan las ~58 seeds curadas.
        //    - Orden: seeds primero (en el orden de SEED_COLLECTION_IDS), luego descubiertas por votos totales desc
        const totalVotes = (c: MovieCollectionInfo) => c.parts.reduce((s, p) => s + (p.vote_count || 0), 0);
        const seedIdx = (id: number) => SEED_COLLECTION_IDS.indexOf(id);

        const filtered = collections
            .filter(c => seedIdx(c.id) !== -1 ? c.parts.length >= 2 : (c.parts.length >= 3 && totalVotes(c) >= 15000))
            .sort((a, b) => {
                const sa = seedIdx(a.id);
                const sb = seedIdx(b.id);
                if (sa !== -1 && sb !== -1) return sa - sb;
                if (sa !== -1) return -1;
                if (sb !== -1) return 1;
                return totalVotes(b) - totalVotes(a);
            });

        popularCache = { data: filtered, expires: Date.now() + POPULAR_TTL_MS };
        if (filtered.length) void setCached(popularKey(), filtered, POPULAR_TTL_MS);
        return filtered;
    } catch (error) {
        console.error("Error al cargar colecciones populares:", error);
        return [];
    }
}

export async function getUserCollections(): Promise<MovieCollectionInfo[]> {
    const uid = getCurrentUid();
    if (!uid) return [];
    const hit = userCache.get(uid);
    if (hit && hit.expires > Date.now()) return hit.data;
    try {
        const { movFavs: favs, movVistos: vistas, movLike: liked, movPend: pendientes, movVerPronto: verPronto } = await getLibrarySnapshot();

        // Dedup por id y quedarnos con el added_at más reciente de cada peli
        const byId = new Map<string, { id: string; ts: number }>();
        for (const m of [...favs, ...vistas, ...liked, ...pendientes, ...verPronto]) {
            const ts = toTimestamp((m as any).added_at);
            const prev = byId.get(m.id);
            if (!prev || ts > prev.ts) byId.set(m.id, { id: m.id, ts });
        }

        if (byId.size === 0) return [];

        // Limitar a las 50 más recientes para capear coste de TMDB
        const recentIds = Array.from(byId.values())
            .sort((a, b) => b.ts - a.ts)
            .slice(0, MAX_USER_MOVIES)
            .map(m => m.id);

        const collectionIds = await extractCollectionIds(recentIds);
        const collections = await loadCollections(collectionIds);
        userCache.set(uid, { data: collections, expires: Date.now() + USER_TTL_MS });
        return collections;
    } catch (error) {
        console.error("Error al cargar tus colecciones:", error);
        return [];
    }
}

export function invalidateCollectionsCache(): void {
    popularCache = null;
    userCache.clear();
    void invalidateCached(popularKey());
}

/** Solo las sagas del usuario de la petición; sin uid (fuera de una petición) se vacía todo. */
function invalidateUserCollectionsCache(): void {
    const uid = getCurrentUid();
    if (uid) userCache.delete(uid);
    else userCache.clear();
}
