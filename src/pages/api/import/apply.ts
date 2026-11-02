/**
 * POST /api/import/apply — escribe un lote de una importación (TMDB D3).
 *
 * Body { job_id, items?, log?, list? }:
 *   items: [{ media_type, tmdb_id, kind: 'seen'|'liked'|'favorite'|'watchlist', rating?, date? }]  (≤ 200)
 *   log:   [{ media_type, tmdb_id, date, rewatch }]   pases del diario con su día real (≤ 300)
 *   list:  { id?, source, name, description, items: [{ media_type, tmdb_id, title, poster_path }] } (≤ 200)
 *          sin `id` se crea (o se reutiliza) la colección y se devuelve `list_id` para los lotes
 *          siguientes de la misma lista.
 * Las reglas (no bajar de nivel, tu nota manda, fecha original) están en
 * `services/BD/import/importLibrary.ts`.
 */
import type { APIRoute } from 'astro';
import {
    applyImportBatch, createImportList, type ImportItem, type ImportListed, type ImportLog,
} from '../../../services/BD/import/importLibrary';
import { normalizeScore } from '../../../utils/constants/helpers/media-helpers';
import { json, isUuid } from './_shared';

export const prerender = false;

const MAX_ITEMS = 200;
const MAX_LOG = 300;
const KINDS = new Set(['seen', 'liked', 'favorite', 'watchlist']);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** media_type + tmdb_id válidos, o null. */
function title(r: any): { media_type: 'movie' | 'tv'; tmdb_id: number } | null {
    const id = Number(r?.tmdb_id);
    if (r?.media_type !== 'movie' && r?.media_type !== 'tv') return null;
    if (!Number.isInteger(id) || id <= 0) return null;
    return { media_type: r.media_type, tmdb_id: id };
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.job_id)) return json({ ok: false, error: 'Importación no válida' }, 400);

    const items: ImportItem[] = [];
    for (const r of (Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [])) {
        const t = title(r);
        if (!t || !KINDS.has(r?.kind)) continue;
        const item: ImportItem = { ...t, kind: r.kind };
        const score = r.rating != null ? normalizeScore(r.rating) : null;
        if (score) item.rating = score;
        if (isDate(r.date)) item.date = r.date;
        items.push(item);
    }

    const log: ImportLog[] = [];
    for (const r of (Array.isArray(body?.log) ? body.log.slice(0, MAX_LOG) : [])) {
        const t = title(r);
        if (t && isDate(r.date)) log.push({ ...t, watched_on: r.date, rewatch: r.rewatch === true });
    }

    try {
        let list: { id: string; items: ImportListed[] } | undefined;
        if (body?.list && Array.isArray(body.list.items)) {
            const listItems: ImportListed[] = [];
            for (const r of body.list.items.slice(0, MAX_ITEMS)) {
                const t = title(r);
                if (t) listItems.push({ ...t, title: String(r.title ?? '').slice(0, 200), poster_path: typeof r.poster_path === 'string' ? r.poster_path : null });
            }
            let id = typeof body.list.id === 'string' ? body.list.id : '';
            if (!id) {
                const first = listItems.find((i) => i.poster_path);
                id = (await createImportList(body.job_id, {
                    name: String(body.list.name ?? ''),
                    description: String(body.list.description ?? ''),
                    suffix: ({ tmdb: 'TMDB', imdb: 'IMDb' } as Record<string, string>)[body.list.source] ?? 'Letterboxd',
                    cover: first ? { poster_path: first.poster_path!, tmdb_id: first.tmdb_id } : null,
                })).id;
            }
            list = { id, items: listItems };
        }

        const result = await applyImportBatch(body.job_id, { items, log, list });
        return json({ ok: true, ...result, ...(list ? { list_id: list.id } : {}) });
    } catch (err) {
        console.error('[api/import/apply] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar el lote.' }, 500);
    }
};
