/**
 * POST /api/movies/finish — "Terminada" de una peli en "Viendo" (Bloque 2).
 *
 * Body { tmdb_id }. Cierra la sesión de visionado: primer visionado → Vistas;
 * re-visionado → pase en el diario. Reutiliza finishViewingMovie. Invitado → 401.
 */
import type { APIRoute } from 'astro';
import { finishViewingMovie } from '../../../services/BD/movies/yourfavsMovie';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const tmdbId = body?.tmdb_id;
        if (!Number.isFinite(Number(tmdbId))) return json({ ok: false, error: 'tmdb_id inválido' }, 400);
        await finishViewingMovie(String(tmdbId));
        return json({ ok: true });
    } catch (err) {
        console.error('[api/movies/finish POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
