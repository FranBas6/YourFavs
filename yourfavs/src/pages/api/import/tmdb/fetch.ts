/**
 * POST /api/import/tmdb/fetch — una página de la cuenta de TMDB conectada (TMDB D3c).
 *
 * Body { kind, page, list_id? }. Devuelve los títulos (con «ya en tus listas») o, para `lists`, el
 * índice de listas, y `total_pages`. Sin conexión (o caducada) → 401 y el navegador lo dice.
 */
import type { APIRoute } from 'astro';
import { ACCOUNT_KINDS, fetchAccountPage, type AccountKind } from '../../../../services/API/shared/tmdbAccount';
import { db, getCurrentLanguage, requireAuthId } from '../../../../services/BD/shared/userScope';
import { json } from '../_shared';
import { getAccess } from './_session';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const session = getAccess(cookies);
    if (!session) return json({ ok: false, error: 'La conexión con TMDB ha caducado.' }, 401);
    const body = await request.json().catch(() => null);
    const kind = body?.kind as AccountKind;
    if (!ACCOUNT_KINDS.includes(kind)) return json({ ok: false, error: 'Qué leer no válido' }, 400);
    const page = Math.min(500, Math.max(1, Number(body?.page) || 1));
    const listId = Number(body?.list_id) || undefined;

    try {
        const r = await fetchAccountPage(session, kind, page, getCurrentLanguage(), listId);
        const ids = r.titles.map((t) => t.tmdb_id);
        let have = new Set<string>();
        if (ids.length) {
            const { data, error } = await db().from('library_items').select('media_type, tmdb_id')
                .eq('user_id', requireAuthId()).in('tmdb_id', ids);
            if (error) throw new Error(error.message);
            have = new Set((data ?? []).map((x) => `${x.media_type}:${x.tmdb_id}`));
        }
        return json({
            ok: true,
            total_pages: r.totalPages,
            titles: r.titles.map((t) => ({ ...t, have: have.has(`${t.media_type}:${t.tmdb_id}`) })),
            ...(r.lists ? { lists: r.lists } : {}),
        });
    } catch (err) {
        console.error('[api/import/tmdb/fetch] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo leer tu cuenta de TMDB.' }, 502);
    }
};
