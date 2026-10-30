/**
 * POST /api/import/apply — escribe un lote de una importación en tus listas (TMDB D3).
 *
 * Body { job_id, items: [{ media_type, tmdb_id, kind: 'seen'|'watchlist', rating?, date? }] }
 * (≤ 200 por lote). Las reglas (no bajar de nivel, tu nota manda, fecha original) están en
 * `services/BD/import/importLibrary.ts`.
 */
import type { APIRoute } from 'astro';
import { applyImportBatch, type ImportItem } from '../../../services/BD/import/importLibrary';
import { normalizeScore } from '../../../utils/constants/helpers/media-helpers';
import { json, isUuid } from './_shared';

export const prerender = false;

const MAX_ITEMS = 200;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.job_id)) return json({ ok: false, error: 'Importación no válida' }, 400);
    const raw = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const items: ImportItem[] = [];
    for (const r of raw) {
        const id = Number(r?.tmdb_id);
        if (r?.media_type !== 'movie' && r?.media_type !== 'tv') continue;
        if (!Number.isInteger(id) || id <= 0) continue;
        if (r?.kind !== 'seen' && r?.kind !== 'watchlist') continue;
        const item: ImportItem = { media_type: r.media_type, tmdb_id: id, kind: r.kind };
        const score = r.rating != null ? normalizeScore(r.rating) : null;
        if (score) item.rating = score;
        if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) item.date = r.date;
        items.push(item);
    }
    try {
        const result = await applyImportBatch(body.job_id, items);
        return json({ ok: true, ...result });
    } catch (err) {
        console.error('[api/import/apply] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar el lote.' }, 500);
    }
};
