/**
 * POST /api/discover/count — nº de resultados que daría una combinación de filtros (2.3b).
 *
 * Body: {
 *   queries: { type: 'movie'|'tv'; base: Record<string,string> }[],  // contexto base por tipo
 *   filters: AdvancedFilters                                          // filtros pendientes del usuario
 * }
 * Suma `total_results` de /discover/{type} para cada query (movie+tv en páginas type=all).
 * El `sort_by` no afecta al total, así que se ignora. Es decorativo: si algo falla → count 0.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../services/API/shared/tmdbClient';
import { buildDiscoverFilterParams, type AdvancedFilters } from '../../../services/API/shared/tmdbDiscoverService';

export const prerender = false;

// Solo permitimos params de contexto conocidos (el body viene del cliente).
// `with_keywords` / `with_companies`: sin ellos el contador de /catalogo/keyword/{id} contaba todo el catálogo.
// País e idioma de origen: los de «Hecho en España» y «De Latinoamérica» (E5); sin ellos el contador
// de su vista ampliada contaba todo el catálogo.
const ALLOWED_BASE = new Set(['with_genres', 'with_watch_providers', 'watch_region', 'with_networks', 'with_keywords', 'with_companies', 'vote_count.gte', 'with_origin_country', 'with_original_language']);

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const queries = Array.isArray(body?.queries) ? body.queries.slice(0, 2) : [];
        const filters = (body?.filters || {}) as AdvancedFilters;
        if (!queries.length) return json({ ok: true, count: 0 });

        const totals = await Promise.all(queries.map(async (q: { type?: string; base?: Record<string, unknown> }) => {
            const type = q?.type === 'tv' ? 'tv' : q?.type === 'movie' ? 'movie' : null;
            if (!type) return 0;
            const base: Record<string, string> = {};
            const raw = q?.base && typeof q.base === 'object' ? q.base : {};
            for (const k of Object.keys(raw)) {
                if (ALLOWED_BASE.has(k) && raw[k] != null) base[k] = String(raw[k]);
            }
            const params: Record<string, string> = { page: '1', ...base, ...buildDiscoverFilterParams(filters, type) };
            const data = await tmdbFetch<{ total_results?: number }>(`/discover/${type}`, params);
            return Number(data?.total_results) || 0;
        }));

        return json({ ok: true, count: totals.reduce((a, b) => a + b, 0) });
    } catch (err) {
        console.error('[api/discover/count] error:', (err as Error).message);
        return json({ ok: false, count: 0 }, 200); // contador decorativo: nunca rompe la UI
    }
};
