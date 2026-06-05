/**
 * POST /api/episodes/watched
 * Body JSON: { serieId, season, episode }
 *
 * Marca un episodio como visto SIN navegar a la ficha (lo usa el botón
 * "✓ Marcar visto" del panel "Continuar viendo"). Idempotente: repetir la
 * llamada no desmarca (a diferencia del toggle de la ficha).
 */
import type { APIRoute } from 'astro';
import { markWatchedEpisode } from '../../../services/BD/series/yourfavsSerie';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        if (!locals.user) return json({ ok: false, error: 'Inicia sesión para guardar' }, 401);

        const body = await request.json();
        const serieId = String(body?.serieId || '');
        const season = Number(body?.season);
        const episode = Number(body?.episode);

        if (!serieId || !Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
            return json({ ok: false, error: 'Parámetros inválidos' }, 400);
        }

        await markWatchedEpisode(serieId, season, episode);
        return json({ ok: true }, 200);
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
