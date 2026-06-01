import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../../services/API/shared/tmdbClient';
import { getCached, setCached, invalidateCached } from '../../../../utils/recsBlobCache';
import { processBatch } from '../../../../utils/processBatch';
import {
    searchEldoblaje,
    pickBestMatch,
    parseFicha,
    resolveSeriesFichas,
    normalizeTitle,
    dubNameToQuery,
    ELDOBLAJE_BASE,
    type DubbingEntry,
    type SeasonFicha,
} from '../../../../services/scraping/eldoblaje';

export const prerender = false;

// Doblajes positivos = inmutables → medio año. Negativos = posible fallo
// transitorio (timeout, ficha aún no creada) → TTL corto que se auto-cura.
const POSITIVE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 12 * 60 * 60 * 1000;

// L1 in-memory: amortiza dentro de la misma instancia caliente de Lambda.
const memCache = new Map<string, { data: DubbingPayload; expires: number }>();

interface DubbingItem {
    originalActor: string;
    dubActor: string;
    dubId: number | null;
    dubUrl: string | null;          // ficha eldoblaje del doblador (carrera completa)
    dubTmdbId: number | null;       // id de TMDB del doblador → /actor/[id] en YourFavs
    dubProfilePath: string | null;  // foto TMDB del doblador (avatar)
    character: string;
    tmdbCastId: number | null;      // id del actor ORIGINAL si casó con el cast TMDB
}

interface DubbingPayload {
    source: 'eldoblaje' | 'none';
    fichaId: number | null;
    fichaUrl: string | null;
    searchUrl: string;              // siempre presente → linkout de fallback
    seasons: number[];              // tv: temporadas disponibles; movie: []
    currentSeason: number | null;   // tv: temporada mostrada; movie: null
    items: DubbingItem[];
}

interface SeriesIndex {
    seasons: SeasonFicha[];
    searchUrl: string;
}

/** Clave de nombre invariante al orden ("Daniel Radcliffe" == "RADCLIFFE, DANIEL"). */
function actorKey(name: string): string {
    return normalizeTitle(name).split(' ').filter(Boolean).sort().join(' ');
}

function ttlFor(payload: DubbingPayload): number {
    return payload.source === 'eldoblaje' && payload.items.length ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
}

/** Construye los items de una ficha cruzando el actor original con el cast de TMDB. */
function buildItems(entries: DubbingEntry[], cast: Array<{ id: number; name: string }>): DubbingItem[] {
    const castByKey = new Map(cast.map((c) => [actorKey(c.name), c.id]));
    return entries.map((e) => ({
        originalActor: e.originalActor,
        dubActor: e.dubActor,
        dubId: e.dubId,
        dubUrl: e.dubId ? `${ELDOBLAJE_BASE}/FichaActorDoblaje.asp?id=${e.dubId}` : null,
        dubTmdbId: null,
        dubProfilePath: null,
        character: e.character,
        tmdbCastId: castByKey.get(actorKey(e.originalActor)) ?? null,
    }));
}

/** Resuelve cada doblador → id+foto de TMDB. Best-effort: fallos quedan sin icono. */
async function resolveDubbers(items: DubbingItem[]): Promise<void> {
    await processBatch(items, async (it) => {
        try {
            const q = dubNameToQuery(it.dubActor);
            if (!q) return;
            const r = await tmdbFetch<any>('/search/person', { query: q });
            const top = (r?.results || [])[0];
            if (top?.id) {
                it.dubTmdbId = top.id;
                it.dubProfilePath = top.profile_path ?? null;
            }
        } catch { /* sin icono, sin drama */ }
    }, 6);
}

async function readCache(key: string): Promise<DubbingPayload | null> {
    const hot = memCache.get(key);
    if (hot && hot.expires > Date.now()) return hot.data;
    const cold = await getCached<DubbingPayload>(key);
    if (cold) {
        memCache.set(key, { data: cold, expires: Date.now() + ttlFor(cold) });
        return cold;
    }
    return null;
}

async function writeCache(key: string, payload: DubbingPayload): Promise<DubbingPayload> {
    const ttl = ttlFor(payload);
    memCache.set(key, { data: payload, expires: Date.now() + ttl });
    await setCached(key, payload, ttl);
    return payload;
}

export const GET: APIRoute = async ({ params, url }) => {
    const { type, id } = params;
    if (!type || !id || (type !== 'movie' && type !== 'tv')) {
        return json({ error: 'invalid' }, 400);
    }

    const refresh = url.searchParams.get('refresh') === '1';
    const searchUrlFallback = `${ELDOBLAJE_BASE}/KeywordResults.asp?keyword=`;

    try {
        // Datos de TMDB: título es-ES + cast (para cruzar el actor original).
        const detail = await tmdbFetch<any>(`/${type}/${id}`, { append_to_response: 'credits' });
        const title: string = type === 'movie' ? detail.title : detail.name;
        const cast: Array<{ id: number; name: string }> = detail.credits?.cast || [];
        const searchUrl = `${ELDOBLAJE_BASE}/KeywordResults.asp?keyword=${encodeURIComponent(title || '')}`;
        const none = (extra: Partial<DubbingPayload> = {}): DubbingPayload => ({
            source: 'none', fichaId: null, fichaUrl: null, searchUrl, seasons: [], currentSeason: null, items: [], ...extra,
        });

        // ── PELÍCULA ──────────────────────────────────────────────────────────
        if (type === 'movie') {
            const cacheKey = `dubbing:movie:${id}`;
            if (refresh) { memCache.delete(cacheKey); await invalidateCached(cacheKey); }
            else { const c = await readCache(cacheKey); if (c) return json(c, 200, true); }

            if (!title) return json(await writeCache(cacheKey, none()), 200);

            const candidates = await searchEldoblaje(title);
            const fichaId = pickBestMatch(title, candidates);
            if (!fichaId) return json(await writeCache(cacheKey, none()), 200);

            const items = buildItems(await parseFicha(fichaId), cast);
            await resolveDubbers(items);
            return json(await writeCache(cacheKey, {
                source: items.length ? 'eldoblaje' : 'none',
                fichaId,
                fichaUrl: `${ELDOBLAJE_BASE}/FichaPelicula.asp?id=${fichaId}`,
                searchUrl, seasons: [], currentSeason: null, items,
            }), 200);
        }

        // ── SERIE ─────────────────────────────────────────────────────────────
        if (!title) return json(none(), 200);

        // 1. Índice de temporadas (cacheado aparte → cambiar de temporada no re-busca).
        const indexKey = `dubbing:tv:${id}:index`;
        let index = refresh ? null : await getCached<SeriesIndex>(indexKey);
        if (!index) {
            const candidates = await searchEldoblaje(title);
            const tmdbYear = parseInt(String(detail.first_air_date || '').slice(0, 4), 10) || null;
            index = { seasons: resolveSeriesFichas(title, candidates, tmdbYear), searchUrl };
            await setCached(indexKey, index, index.seasons.length ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
        }
        const fichas = index.seasons;
        if (!fichas.length) return json(none(), 200);

        // 2. Temporada objetivo: la pedida, o la más baja disponible.
        const reqSeason = parseInt(url.searchParams.get('season') || '', 10);
        const target = fichas.find((f) => f.season === reqSeason) || fichas[0];
        const seasonNumbers = fichas.map((f) => f.season);

        // 3. Items de esa temporada (cacheados por temporada).
        const seasonKey = `dubbing:tv:${id}:s${target.season}`;
        if (refresh) { memCache.delete(seasonKey); await invalidateCached(seasonKey); }
        else {
            const c = await readCache(seasonKey);
            if (c) return json({ ...c, seasons: seasonNumbers, currentSeason: target.season }, 200, true);
        }

        const items = buildItems(await parseFicha(target.fichaId), cast);
        await resolveDubbers(items);
        return json(await writeCache(seasonKey, {
            source: items.length ? 'eldoblaje' : 'none',
            fichaId: target.fichaId,
            fichaUrl: `${ELDOBLAJE_BASE}/FichaPelicula.asp?id=${target.fichaId}`,
            searchUrl, seasons: seasonNumbers, currentSeason: target.season, items,
        }), 200);
    } catch (err) {
        console.error('[api/dubbing] error:', (err as Error).message);
        // Degradación elegante: linkout genérico, SIN cachear el fallo.
        return json({
            source: 'none', fichaId: null, fichaUrl: null,
            searchUrl: searchUrlFallback, seasons: [], currentSeason: null, items: [],
        } as DubbingPayload, 200);
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
