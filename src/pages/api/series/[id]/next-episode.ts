/**
 * GET /api/series/:id/next-episode
 *
 * Devuelve el siguiente episodio a ver de una serie (primer NO visto y
 * emitido) o { next: null } si está al día. Lo usa el panel "Continuar
 * viendo" para avanzar la card tras "✓ Marcar visto" — misma función que el
 * render SSR (computeNextEpisode), así nunca divergen.
 */
import type { APIRoute } from 'astro';
import { getNextEpisode } from '../../../../services/API/Series/nextEpisode';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
    const id = String(params.id || '');
    if (!/^\d+$/.test(id)) {
        return json({ next: null }, 400);
    }

    try {
        const next = await getNextEpisode(id);
        return json({ next }, 200);
    } catch (err) {
        console.error('[api/series/next-episode] error:', (err as Error).message);
        return json({ next: null }, 200);
    }
};

function json(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
