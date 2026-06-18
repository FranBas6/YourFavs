/**
 * GET /api/search/personal?q=...
 *
 * Buscador "lo mío" del command palette (4.3): filtra SOLO la biblioteca del
 * usuario (listas + tags + nota) por título o etiqueta. El uid sale de la sesión
 * (locals.user); invitado → 401. Devuelve el mismo shape que /api/search/multi
 * para que el palette lo renderice sin código nuevo.
 */
import type { APIRoute } from 'astro';
import { posterUrl } from '../../../services/API/shared/tmdbClient';
import { buildPersonalIndex, foldText } from '../../../services/BD/shared/personalIndex';

export const prerender = false;

const MAX_RESULTS = 24;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ url, locals }) => {
    if (!locals.user) return json({ query: '', items: [], error: 'No autorizado' }, 401);

    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 1) return json({ query: q, items: [] });

    try {
        const index = await buildPersonalIndex();
        const needle = foldText(q);
        const matched = index.filter(i => i.searchText.includes(needle));

        // Orden: primero los que empiezan por la query, luego por nota desc.
        matched.sort((a, b) => {
            const aStarts = a.searchText.startsWith(needle) ? 1 : 0;
            const bStarts = b.searchText.startsWith(needle) ? 1 : 0;
            if (aStarts !== bStarts) return bStarts - aStarts;
            return (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title);
        });

        const items = matched.slice(0, MAX_RESULTS).map(i => ({
            id: Number(i.id),
            media_type: i.media_type,
            title: i.title,
            subtitle: [i.lists.join(' · '), i.rating ? `★ ${i.rating}` : ''].filter(Boolean).join('  ·  '),
            image: i.poster_path ? posterUrl(i.poster_path, 'w92') : null,
            poster_path: i.poster_path,
            rating: i.rating,
            href: i.media_type === 'movie' ? `/movie/${i.id}` : `/serie/${i.id}`,
        }));

        return json({ query: q, items });
    } catch (err) {
        console.error('[api/search/personal] error:', (err as Error).message);
        return json({ query: q, items: [] });
    }
};
