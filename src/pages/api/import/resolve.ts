/**
 * POST /api/import/resolve — un lote de filas de otra app → títulos de TMDB (TMDB D3).
 *
 * Body (≤ 50 filas por lote: el navegador trocea el fichero para no chocar con el tiempo máximo de
 * una función de Netlify):
 *   { source: 'imdb',       rows: [{ imdb, type }] }      → exacto, con `/find`
 *   { source: 'letterboxd', rows: [{ key, name, year }] } → por título y año, con `/search`
 * Respuesta, en el mismo orden y con la clave de cada fila (`imdb` o `key`): `found` (con título,
 * año, póster y si ya lo tienes en alguna lista), `ambiguous` (solo Letterboxd: candidatas para
 * elegir), `missing` o `error` (fallo de TMDB: el navegador lo reintenta).
 */
import type { APIRoute } from 'astro';
import { resolveImdbIds, resolveByTitle } from '../../../services/API/shared/importResolve';
import { db, getCurrentLanguage, requireAuthId } from '../../../services/BD/shared/userScope';
import { json } from './_shared';

export const prerender = false;

const MAX_ROWS = 50;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    const source = body?.source;
    if (source !== 'imdb' && source !== 'letterboxd') return json({ ok: false, error: 'Origen no soportado' }, 400);
    const rows: any[] = Array.isArray(body?.rows) ? body.rows.slice(0, MAX_ROWS) : [];

    try {
        let results: Record<string, any>[];
        if (source === 'imdb') {
            const clean: { imdb: string; type: 'movie' | 'tv' }[] = rows
                .filter((r) => typeof r?.imdb === 'string' && /^tt\d{5,10}$/.test(r.imdb))
                .map((r) => ({ imdb: r.imdb as string, type: r.type === 'tv' ? 'tv' : 'movie' }));
            const resolved = await resolveImdbIds(clean);
            results = clean.map((row, i) => {
                const r = resolved[i];
                if (r === 'error') return { imdb: row.imdb, status: 'error' };
                if (!r) return { imdb: row.imdb, status: 'missing' };
                return { imdb: row.imdb, status: 'found', ...r };
            });
        } else {
            const clean = rows
                .filter((r) => typeof r?.key === 'string' && typeof r?.name === 'string' && r.name.trim())
                .map((r) => ({ key: String(r.key).slice(0, 300), name: String(r.name).trim().slice(0, 200), year: Number(r.year) || null }));
            const resolved = await resolveByTitle(clean, getCurrentLanguage());
            results = clean.map((row, i) => ({ key: row.key, ...resolved[i] }));
        }

        // ¿Cuáles tienes ya en alguna lista? Una consulta para el lote.
        const ids = results.flatMap((r) => (r.status === 'found' ? [r.tmdb_id as number] : []));
        if (ids.length) {
            const { data, error } = await db().from('library_items').select('media_type, tmdb_id')
                .eq('user_id', requireAuthId()).in('tmdb_id', ids);
            if (error) throw new Error(error.message);
            const have = new Set((data ?? []).map((r) => `${r.media_type}:${r.tmdb_id}`));
            for (const r of results) if (r.status === 'found') r.have = have.has(`${r.media_type}:${r.tmdb_id}`);
        }
        return json({ ok: true, results });
    } catch (err) {
        console.error('[api/import/resolve] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo buscar el lote.' }, 500);
    }
};
