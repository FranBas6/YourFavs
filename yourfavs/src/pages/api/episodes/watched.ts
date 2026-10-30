/**
 * POST /api/episodes/watched
 * Body JSON: { serieId, season, episode, action?: 'mark' | 'unmark', episodes?: number[] }
 *
 * Marca un episodio como visto SIN navegar a la ficha (lo usa el botón
 * "✓ Marcar visto" del panel "Continuar viendo"). Idempotente: repetir la
 * llamada no desmarca (a diferencia del toggle de la ficha).
 *
 * La ficha de episodio (TMDB D4) lo usa además para:
 *   · `action: 'unmark'` → desmarcar (también idempotente);
 *   · `episodes: [1, 2…]` → marcar varios de la temporada a la vez («Marcarlos»);
 *   · la temporada 0 (especiales).
 * Sin `action` hace lo de siempre. Devuelve `watchedAt` (el instante guardado) al marcar uno.
 */
import type { APIRoute } from 'astro';
import { markWatchedEpisode, markWatchedEpisodes, unmarkWatchedEpisode, getWatchedProgress } from '../../../services/BD/series/yourfavsSerie';

export const prerender = false;

const MAX_EPISODES = 200;

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        if (!locals.user) return json({ ok: false, error: 'Inicia sesión para guardar' }, 401);

        const body = await request.json();
        const serieId = String(body?.serieId || '');
        const season = Number(body?.season);
        const episode = Number(body?.episode);
        const action = body?.action === 'unmark' ? 'unmark' : 'mark';

        if (!/^\d+$/.test(serieId) || !Number.isInteger(season) || season < 0) {
            return json({ ok: false, error: 'Parámetros inválidos' }, 400);
        }

        if (Array.isArray(body?.episodes)) {
            const eps = [...new Set<number>(body.episodes.map(Number))].filter((n) => Number.isInteger(n) && n >= 1).slice(0, MAX_EPISODES);
            if (!eps.length) return json({ ok: false, error: 'Parámetros inválidos' }, 400);
            const marked = await markWatchedEpisodes(serieId, season, eps);
            return json({ ok: true, marked }, 200);
        }

        if (!Number.isInteger(episode) || episode < 1) return json({ ok: false, error: 'Parámetros inválidos' }, 400);

        if (action === 'unmark') {
            await unmarkWatchedEpisode(serieId, season, episode);
            return json({ ok: true }, 200);
        }
        await markWatchedEpisode(serieId, season, episode);
        const progress = await getWatchedProgress(serieId);
        const row = progress?.watched_episodes.find((w) => w.season === season && w.episode === episode) as { watched_at?: string } | undefined;
        return json({ ok: true, watchedAt: row?.watched_at ?? null }, 200);
    } catch (err) {
        console.error('[api/episodes/watched] error:', (err as Error).message);
        return json({ ok: false, error: 'Error al guardar' }, 500);
    }
};

function json(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
