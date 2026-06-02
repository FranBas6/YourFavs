import { tmdbFetch, tmdbFetchList } from "./tmdbClient";
import { processBatch } from "../../../utils/processBatch";
import { getMovieCollectionInfo, type MovieCollectionInfo } from "../Movies/InfoMovies";
import {
    getMovieFav, getMoviesVistas, getLikedMovies,
    getMoviesPendientes, getMoviesVerPronto
} from "../../BD/movies/yourfavsMovie";
import { getFirebaseTimestamp } from "../../../utils/constants/helpers/media-helpers";
import { SEED_COLLECTION_IDS } from "../../../utils/constants/featuredCollections";

interface CacheEntry<T> { data: T; expires: number }
const POPULAR_TTL_MS = 60 * 60 * 1000;
const USER_TTL_MS = 5 * 60 * 1000;
const MAX_USER_MOVIES = 50;

let popularCache: CacheEntry<MovieCollectionInfo[]> | null = null;
let userCache: CacheEntry<MovieCollectionInfo[]> | null = null;

async function extractCollectionIds(movieIds: string[]): Promise<number[]> {
    const results = await processBatch(
        movieIds,
        async (id: string): Promise<number | null> => {
            try {
                const d = await tmdbFetch<any>(`/movie/${id}`);
                return d?.belongs_to_collection?.id ?? null;
            } catch {
                return null;
            }
        },
        10
    );
    const unique = new Set<number>();
    for (const id of results) if (typeof id === 'number') unique.add(id);
    return Array.from(unique);
}

async function loadCollections(ids: number[]): Promise<MovieCollectionInfo[]> {
    const results = await processBatch(ids, (id: number) => getMovieCollectionInfo(id), 6);
    return results.filter((c): c is MovieCollectionInfo => c !== null);
}

export async function getPopularCollections(): Promise<MovieCollectionInfo[]> {
    if (popularCache && popularCache.expires > Date.now()) return popularCache.data;
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
        return filtered;
    } catch (error) {
        console.error("Error al cargar colecciones populares:", error);
        return [];
    }
}

export async function getUserCollections(): Promise<MovieCollectionInfo[]> {
    if (userCache && userCache.expires > Date.now()) return userCache.data;
    try {
        const [favs, vistas, liked, pendientes, verPronto] = await Promise.all([
            getMovieFav(), getMoviesVistas(), getLikedMovies(),
            getMoviesPendientes(), getMoviesVerPronto(),
        ]);

        // Dedup por id y quedarnos con el added_at más reciente de cada peli
        const byId = new Map<string, { id: string; ts: number }>();
        for (const m of [...favs, ...vistas, ...liked, ...pendientes, ...verPronto]) {
            const ts = getFirebaseTimestamp((m as any).added_at);
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
        userCache = { data: collections, expires: Date.now() + USER_TTL_MS };
        return collections;
    } catch (error) {
        console.error("Error al cargar tus colecciones:", error);
        return [];
    }
}

export function invalidateCollectionsCache(): void {
    popularCache = null;
    userCache = null;
}

export function invalidateUserCollectionsCache(): void {
    userCache = null;
}
