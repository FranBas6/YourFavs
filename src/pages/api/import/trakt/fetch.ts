/**
 * POST /api/import/trakt/fetch — una página de la cuenta de Trakt conectada (lote F2).
 *
 * Body { kind, page, list_id? }. Devuelve los títulos con su id de TMDB (el título bueno, el póster y
 * «ya en tus listas» los pone luego `/api/import/resolve`) o, para `lists`, el índice de listas.
 * Sin conexión (o caducada) → 401 y el navegador lo dice.
 */
import type { APIRoute } from 'astro';
import { fetchTraktPage, TRAKT_KINDS, type TraktKind } from '../../../../services/API/shared/traktAccount';
import { json } from '../_shared';
import { getAccess } from './_session';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const token = getAccess(cookies);
    if (!token) return json({ ok: false, error: 'La conexión con Trakt ha caducado.' }, 401);
    const body = await request.json().catch(() => null);
    const kind = body?.kind as TraktKind;
    if (!TRAKT_KINDS.includes(kind)) return json({ ok: false, error: 'Qué leer no válido' }, 400);
    const page = Math.min(500, Math.max(1, Number(body?.page) || 1));
    try {
        const r = await fetchTraktPage(token, kind, page, Number(body?.list_id) || undefined);
        return json({ ok: true, total_pages: r.pages, titles: r.titles, skipped: r.skipped, ...(r.lists ? { lists: r.lists } : {}) });
    } catch (err) {
        console.error('[api/import/trakt/fetch] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo leer tu cuenta de Trakt.' }, 502);
    }
};
