import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../services/API/shared/tmdbClient';
import { getCached, setCached, invalidateCached } from '../../../utils/recsBlobCache';
import { processBatch } from '../../../utils/processBatch';
import {
    searchDubberFichaId,
    fetchDubberFilmography,
    normalizeTitle,
    tokenSet,
    ELDOBLAJE_BASE,
    type DubberWork,
} from '../../../services/scraping/eldoblaje';

export const prerender = false;

const POSITIVE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 12 * 60 * 60 * 1000;

const memCache = new Map<string, { data: ActorDubbingPayload; expires: number }>();

interface DubWorkItem {
    title: string;            // "TRACKER [2ª temporada]"
    originalActor: string;
    character: string;
    year: number | null;
    url: string;              // YourFavs si resuelve, si no la ficha de eldoblaje
    internal: boolean;        // true → enlace interno YourFavs
    mediaType: 'movie' | 'tv' | null;
}

interface ActorDubbingPayload {
    source: 'eldoblaje' | 'none';
    dubberUrl: string | null; // ficha del doblador en eldoblaje
    items: DubWorkItem[];
}

/** Resuelve un título de eldoblaje → {mediaType, id, title} de TMDB. null si no hay match fiable. */
async function resolveTitle(work: DubberWork): Promise<{ mediaType: 'movie' | 'tv'; id: number; title: string } | null> {
    if (!work.baseTitle) return null;
    let results: any[] = [];
    try {
        const r = await tmdbFetch<any>('/search/multi', { query: work.baseTitle });
        results = (r?.results || []).filter((x: any) => x.media_type === 'movie' || x.media_type === 'tv');
    } catch { return null; }
    if (!results.length) return null;

    const target = normalizeTitle(work.baseTitle);
    const targetTokens = tokenSet(work.baseTitle);
    let best: any = null;
    let bestScore = -1;

    for (const c of results) {
        const candTitle = c.media_type === 'movie' ? (c.title || c.original_title) : (c.name || c.original_name);
        if (!candTitle) continue;
        // Filtro de calidad: descarta stubs basura (videojuegos colados como
        // "Horizon Zero Dawn"/"Heavy Rain" con votes 0-2, pop <1). Lo real lo supera.
        if ((c.vote_count ?? 0) < 5 && (c.popularity ?? 0) < 1.5) continue;
        const candNorm = normalizeTitle(candTitle);

        let titleScore = candNorm === target ? 1 : 0;
        if (!titleScore) {
            const ct = tokenSet(candTitle);
            let inter = 0;
            for (const t of targetTokens) if (ct.has(t)) inter++;
            const union = targetTokens.size + ct.size - inter;
            titleScore = union ? inter / union : 0;
        }
        if (titleScore < 0.7) continue; // sin título fiable, descartar

        const date: string = c.media_type === 'movie' ? (c.release_date || '') : (c.first_air_date || '');
        const candYear = parseInt(date.slice(0, 4), 10) || null;
        const yearClose = work.year != null && candYear != null && Math.abs(candYear - work.year) <= 1;
        // pista de tipo: si el título traía "[Nª temporada]" es serie
        const typeMatch = work.season != null ? c.media_type === 'tv' : true;

        const score = titleScore * 2 + (typeMatch ? 0.6 : 0) + (yearClose ? 0.5 : 0) + Math.min((c.popularity || 0) / 100, 0.3);
        if (score > bestScore) { bestScore = score; best = c; }
    }

    if (!best) return null;
    const displayTitle = best.media_type === 'movie'
        ? (best.title || best.original_title)
        : (best.name || best.original_name);
    return { mediaType: best.media_type, id: best.id, title: displayTitle };
}

export const GET: APIRoute = async ({ params, url }) => {
    const tmdbId = params.id;
    if (!tmdbId) return json({ error: 'invalid' }, 400);

    const cacheKey = `dubbingActor:${tmdbId}`;
    const refresh = url.searchParams.get('refresh') === '1';

    if (refresh) { memCache.delete(cacheKey); await invalidateCached(cacheKey); }
    else {
        const hot = memCache.get(cacheKey);
        if (hot && hot.expires > Date.now()) return json(hot.data, 200, true);
        const cold = await getCached<ActorDubbingPayload>(cacheKey);
        if (cold) {
            const ttl = cold.source === 'eldoblaje' ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
            memCache.set(cacheKey, { data: cold, expires: Date.now() + ttl });
            return json(cold, 200, true);
        }
    }

    const finish = async (payload: ActorDubbingPayload): Promise<Response> => {
        const ttl = payload.source === 'eldoblaje' && payload.items.length ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
        memCache.set(cacheKey, { data: payload, expires: Date.now() + ttl });
        await setCached(cacheKey, payload, ttl);
        return json(payload, 200);
    };

    try {
        // Nombre: del query (lo tiene la página) o de TMDB como respaldo.
        let name = url.searchParams.get('name') || '';
        if (!name) {
            const person = await tmdbFetch<any>(`/person/${tmdbId}`);
            name = person?.name || '';
        }
        if (!name) return finish({ source: 'none', dubberUrl: null, items: [] });

        // ¿Es doblador en eldoblaje? (la mayoría de actores NO lo son → none).
        const dubberId = await searchDubberFichaId(name);
        if (!dubberId) return finish({ source: 'none', dubberUrl: null, items: [] });

        const allWorks = await fetchDubberFilmography(dubberId);
        const dubberUrl = `${ELDOBLAJE_BASE}/FichaActorDoblaje.asp?id=${dubberId}`;

        // Quitar videojuegos explícitos y dedupe por título base (colapsa las
        // temporadas de una serie en una sola entrada, la más reciente).
        const byTitle = new Map<string, DubberWork>();
        for (const w of allWorks) {
            if (w.isVideogame || !w.baseTitle) continue;
            const key = normalizeTitle(w.baseTitle);
            const prev = byTitle.get(key);
            if (!prev || (w.year ?? 0) > (prev.year ?? 0)) byTitle.set(key, w);
        }
        // Cap de seguridad: resolver como mucho N títulos (los más recientes) para
        // no reventar el presupuesto de 10s en dobladores muy prolíficos.
        const RESOLVE_CAP = 150;
        const unique = [...byTitle.values()]
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
            .slice(0, RESOLVE_CAP);
        if (!unique.length) return finish({ source: 'none', dubberUrl, items: [] });

        // Resolver a TMDB y QUEDARNOS SOLO con lo que casa a peli/serie → así
        // mueren también los videojuegos sin marcar (Horizon…), que no están en TMDB.
        const resolved = await processBatch(unique, async (w): Promise<DubWorkItem | null> => {
            const hit = await resolveTitle(w);
            if (!hit) return null;
            return {
                title: hit.title || w.baseTitle, // título bonito de TMDB
                originalActor: w.originalActor,
                character: w.character,
                year: w.year,
                url: hit.mediaType === 'movie' ? `/movie/${hit.id}` : `/serie/${hit.id}`,
                internal: true,
                mediaType: hit.mediaType,
            };
        }, 10);

        const items = resolved
            .filter((x): x is DubWorkItem => x !== null)
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

        return finish({ source: items.length ? 'eldoblaje' : 'none', dubberUrl, items });
    } catch (err) {
        console.error('[api/dubbing-actor] error:', (err as Error).message);
        return json({ source: 'none', dubberUrl: null, items: [] } as ActorDubbingPayload, 200);
    }
};

function json(data: unknown, status: number, cacheable = false): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...(cacheable ? { 'Cache-Control': 'public, max-age=86400' } : {}),
        },
    });
}
