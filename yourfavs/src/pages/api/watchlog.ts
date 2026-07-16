/**
 * POST /api/watchlog — registrar un visionado en el diario (WatchLog).
 *
 *   { media_type, tmdb_id, watched_on?, season?, episode? } → añade una entrada.
 *
 * Lo usa "Vista otra vez" en la ficha (re-visionado). El registro normal al marcar
 * vista/episodios lo hacen los handlers en servidor. Invitado → 401; uid de la sesión.
 */
import type { APIRoute } from 'astro';
import { appendWatchLog } from '../../services/BD/lists/watchLog';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const mediaType = body?.media_type;
        const tmdbId = body?.tmdb_id;

        if (mediaType !== 'movie' && mediaType !== 'tv') return json({ ok: false, error: 'media_type inválido' }, 400);
        if (!Number.isFinite(Number(tmdbId))) return json({ ok: false, error: 'tmdb_id inválido' }, 400);

        // Nota opcional (§6 "detalles con alma"): ¿con quién? ¿qué te pareció?
        const noteRaw = typeof body?.note === 'string' ? body.note.trim() : '';

        const res = await appendWatchLog({
            media_type: mediaType,
            tmdb_id: tmdbId,
            watched_on: isDate(body?.watched_on) ? body.watched_on : undefined,
            season: Number.isFinite(Number(body?.season)) ? Number(body.season) : undefined,
            episode: Number.isFinite(Number(body?.episode)) ? Number(body.episode) : undefined,
            note: noteRaw || undefined,
        });
        return json({ ok: true, rewatch: res.rewatch });
    } catch (err) {
        console.error('[api/watchlog POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
