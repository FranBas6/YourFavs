/**
 * GET /api/search/cast?ids=1,2,3&mode=and|or — Buscar por reparto (intersección).
 *
 * Devuelve los títulos (pelis + series) donde coinciden varios actores:
 *   - mode=and (por defecto) → títulos donde actúan TODOS.
 *   - mode=or                → títulos donde actúa CUALQUIERA.
 *
 * NB: no se usa /discover porque `/discover/tv` NO admite filtrar por persona
 * (`with_cast`/`with_people` solo aplican a /discover/movie). En su lugar se piden
 * los `combined_credits` de cada actor (pelis + series de una vez) y se intersecan/
 * unen en el servidor por `media_type:id`. Así el `count` es exacto (no paginado).
 *
 * Público (solo dato TMDB). Convención `{ ok, count, items }`.
 */
import type { APIRoute } from 'astro';
import { toItem, type SummaryItem } from '../summary';
import { getCombinedCastCredits } from '../../../services/API/Actors/tmdbActor';

export const prerender = false;

const MAX_ACTORS = 5;

// Géneros TV de "no ficción" donde los actores salen como invitados (late-night,
// galas, realities). Se excluyen para que la intersección sean títulos reales, no
// apariciones en The Tonight Show / los Emmy. IDs TMDB: News, Reality, Talk.
const NOISE_TV_GENRES = new Set([10763, 10764, 10767]);

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Créditos crudos de un actor → Map `media_type:id` → item (dedup, quedándonos el más popular). */
function creditsToMap(credits: any[]): Map<string, any> {
    const m = new Map<string, any>();
    for (const c of credits) {
        if (!c?.id || (c.media_type !== 'movie' && c.media_type !== 'tv')) continue;
        if (c.media_type === 'tv' && Array.isArray(c.genre_ids) && c.genre_ids.some((g: number) => NOISE_TV_GENRES.has(g))) continue;
        const key = `${c.media_type}:${c.id}`;
        const prev = m.get(key);
        if (!prev || (c.popularity ?? 0) > (prev.popularity ?? 0)) m.set(key, c);
    }
    return m;
}

export const GET: APIRoute = async ({ url }) => {
    // ids numéricos, deduplicados, cap MAX_ACTORS.
    const ids = [...new Set(
        (url.searchParams.get('ids') || '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s))
    )].slice(0, MAX_ACTORS);

    const mode = url.searchParams.get('mode') === 'or' ? 'or' : 'and';

    if (!ids.length) return json({ ok: true, count: 0, items: [] });

    try {
        const sets = (await Promise.all(ids.map(getCombinedCastCredits))).map(creditsToMap);

        // AND = claves presentes en TODOS los actores · OR = unión.
        let resultMap: Map<string, any>;
        if (mode === 'or') {
            resultMap = new Map();
            for (const s of sets) for (const [k, v] of s) if (!resultMap.has(k)) resultMap.set(k, v);
        } else {
            const [first, ...rest] = sets;
            resultMap = new Map([...first].filter(([k]) => rest.every((s) => s.has(k))));
        }

        // Ordenar por popularidad ANTES de normalizar (SummaryItem no lleva popularity).
        const merged = [...resultMap.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        const items: SummaryItem[] = merged
            .map((c) => toItem(c, c.media_type))
            .filter((it): it is SummaryItem => it !== null);

        return json({ ok: true, count: items.length, items });
    } catch (err) {
        console.error('[api/search/cast GET] error:', (err as Error).message);
        return json({ ok: false, count: 0, items: [] }, 500);
    }
};
