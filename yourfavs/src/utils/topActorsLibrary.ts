import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getLibrarySnapshot } from '../services/BD/shared/librarySnapshot';

const TTL_MS = 60 * 60 * 1000;
const MAX_CAST_ORDER = 10;

export interface TopActor {
    id: number;
    name: string;
    profile_path: string | null;
    appearances: number;
    movies: number;
    series: number;
}

let cache: { data: TopActor[]; expires: number } | null = null;

export function invalidateTopActorsCache() { cache = null; }

/**
 * Lee el top de actores de la caché SIN computar (3.4). Devuelve null si está
 * fría → las fichas no disparan el cómputo (caro) y se quedan rápidas; el badge
 * "visto N con esta persona" solo aparece cuando la caché ya está caliente.
 */
export function peekTopActors(): TopActor[] | null {
    return cache && cache.expires > Date.now() ? cache.data : null;
}

interface CastEntry { id: number; name: string; profile_path: string | null; order: number }
interface CreditsResponse { cast?: CastEntry[] }

export async function calculateTopActors(limit = 10): Promise<TopActor[]> {
    const now = Date.now();
    if (cache && cache.expires > now) return cache.data;

    const { movFavs, movVistos, movLike, tvFavs, tvVistos, tvSig, tvLike } = await getLibrarySnapshot();

    const movieIds = new Set<string>();
    for (const arr of [movFavs, movVistos, movLike]) for (const m of arr) movieIds.add(m.id);
    const seriesIds = new Set<string>();
    for (const arr of [tvFavs, tvVistos, tvSig, tvLike]) for (const s of arr) seriesIds.add(s.id);

    const items: { id: string; kind: 'movie' | 'tv' }[] = [
        ...Array.from(movieIds).map(id => ({ id, kind: 'movie' as const })),
        ...Array.from(seriesIds).map(id => ({ id, kind: 'tv' as const })),
    ];

    const credits = await processBatch(
        items,
        async ({ id, kind }) => {
            try {
                const path = kind === 'movie' ? `/movie/${id}/credits` : `/tv/${id}/credits`;
                const data = await tmdbFetch<CreditsResponse>(path);
                return { kind, cast: data.cast || [] };
            } catch {
                return { kind, cast: [] as CastEntry[] };
            }
        },
        10
    );

    const counter = new Map<number, TopActor>();
    for (const { kind, cast } of credits) {
        for (const c of cast) {
            if (typeof c.order === 'number' && c.order > MAX_CAST_ORDER) continue;
            const cur = counter.get(c.id);
            if (cur) {
                cur.appearances++;
                if (kind === 'movie') cur.movies++; else cur.series++;
            } else {
                counter.set(c.id, {
                    id: c.id,
                    name: c.name,
                    profile_path: c.profile_path,
                    appearances: 1,
                    movies: kind === 'movie' ? 1 : 0,
                    series: kind === 'tv' ? 1 : 0,
                });
            }
        }
    }

    const top = Array.from(counter.values())
        .filter(a => a.appearances >= 2)
        .sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name))
        .slice(0, limit);

    cache = { data: top, expires: now + TTL_MS };
    return top;
}
