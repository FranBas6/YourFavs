/**
 * POST /api/lists/order — guardar el orden de una lista que se ordena a mano (Ver pronto, 2026-11-18).
 *
 *   body { collection: 'MoviesVerPronto' | 'SeriesVerPronto', ids: number[] }   → { ok }
 *
 * `ids` son los títulos que enseña la página, en su orden; los que no vengan quedan detrás (ver
 * `reorderCollection`). Invitado → 401. El uid sale SIEMPRE de la sesión, nunca del body.
 */
import type { APIRoute } from 'astro';
import { isManualOrderCollection, reorderCollection } from '../../../services/library/library';
import { jsonNoStore } from '../../../services/http/http';

export const prerender = false;

const MAX_IDS = 1000;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const collection = String(body?.collection || '');
        if (!isManualOrderCollection(collection)) return jsonNoStore({ ok: false, error: 'Lista no ordenable' }, 400);
        const raw: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
        const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
        if (!ids.length || ids.length !== raw.length || ids.length > MAX_IDS) {
            return jsonNoStore({ ok: false, error: 'Orden inválido' }, 400);
        }
        await reorderCollection(collection, ids);
        return jsonNoStore({ ok: true });
    } catch (err) {
        console.error('[api/lists/order] error:', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se ha podido guardar el orden.' }, 500);
    }
};
