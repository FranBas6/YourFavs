/**
 * POST /api/import/resolve — un lote de filas de otra app → títulos de TMDB (TMDB D3).
 *
 * Body { source: 'imdb', rows: [{ imdb, type }] } (≤ 50 por lote: el navegador trocea el fichero
 * para no chocar con el tiempo máximo de una función de Netlify). Respuesta, en el mismo orden:
 * `found` (con título, año, póster y si ya lo tienes en alguna lista), `missing` o `error` (fallo
 * de TMDB: el navegador lo reintenta).
 */
import type { APIRoute } from 'astro';
import { resolveImdbIds } from '../../../services/API/shared/importResolve';
import { db, requireAuthId } from '../../../services/BD/shared/userScope';
import { json } from './_shared';

export const prerender = false;

const MAX_ROWS = 50;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    if (body?.source !== 'imdb') return json({ ok: false, error: 'Origen no soportado' }, 400);
    const rows = Array.isArray(body?.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    const clean: { imdb: string; type: 'movie' | 'tv' }[] = rows
        .filter((r: any) => typeof r?.imdb === 'string' && /^tt\d{5,10}$/.test(r.imdb))
        .map((r: any) => ({ imdb: r.imdb as string, type: r.type === 'tv' ? 'tv' : 'movie' }));
    if (!clean.length) return json({ ok: true, results: [] });

    try {
        const resolved = await resolveImdbIds(clean);

        // ¿Cuáles tienes ya en alguna lista? Una consulta para el lote.
        const ids = resolved.flatMap((r) => (r && r !== 'error' ? [r.tmdb_id] : []));
        const have = new Set<string>();
        if (ids.length) {
            const { data, error } = await db().from('library_items').select('media_type, tmdb_id')
                .eq('user_id', requireAuthId()).in('tmdb_id', ids);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) have.add(`${r.media_type}:${r.tmdb_id}`);
        }

        const results = clean.map((row, i) => {
            const r = resolved[i];
            if (r === 'error') return { imdb: row.imdb, status: 'error' };
            if (!r) return { imdb: row.imdb, status: 'missing' };
            return { imdb: row.imdb, status: 'found', ...r, have: have.has(`${r.media_type}:${r.tmdb_id}`) };
        });
        return json({ ok: true, results });
    } catch (err) {
        console.error('[api/import/resolve] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo buscar el lote.' }, 500);
    }
};
