/**
 * POST /api/watchlog — diario de visionado (Fase L5).
 *
 *   { op:'adjust', media_type, tmdb_id, watched_on }  → cambia la fecha de la última entrada
 *   { op:'append', media_type, tmdb_id, watched_on?, season?, episode? } → añade entrada
 *
 * El registro normal de pelis/series lo hacen los handlers en servidor; este endpoint
 * sirve al popover "¿cuándo?" (adjust) y queda abierto para usos cliente (append).
 * Invitado → 401. El uid sale de la sesión.
 */
import type { APIRoute } from 'astro';
import { adjustLastWatchDate, appendWatchLog } from '../../services/BD/lists/watchLog';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const op = body?.op === 'append' ? 'append' : 'adjust';
        const mediaType = body?.media_type;
        const tmdbId = body?.tmdb_id;

        if (mediaType !== 'movie' && mediaType !== 'tv') return json({ ok: false, error: 'media_type inválido' }, 400);
        if (!Number.isFinite(Number(tmdbId))) return json({ ok: false, error: 'tmdb_id inválido' }, 400);

        if (op === 'adjust') {
            if (!isDate(body?.watched_on)) return json({ ok: false, error: 'watched_on inválido' }, 400);
            await adjustLastWatchDate(mediaType, tmdbId, body.watched_on);
            return json({ ok: true });
        }

        const res = await appendWatchLog({
            media_type: mediaType,
            tmdb_id: tmdbId,
            watched_on: isDate(body?.watched_on) ? body.watched_on : undefined,
            season: Number.isFinite(Number(body?.season)) ? Number(body.season) : undefined,
            episode: Number.isFinite(Number(body?.episode)) ? Number(body.episode) : undefined,
        });
        return json({ ok: true, rewatch: res.rewatch });
    } catch (err) {
        console.error('[api/watchlog POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
