/**
 * POST /api/import/jobs — abre una importación (TMDB D3) justo antes de aplicarla.
 *
 * Body { source, label, file_hash, totals }. `totals` son los números de la vista previa (filas,
 * encontradas, no encontradas, ignoradas); lo que se aplica lo suma `import_apply` después.
 */
import type { APIRoute } from 'astro';
import { createImportJob, type ImportSource } from '../../../services/BD/import/importLibrary';
import { json } from './_shared';

export const prerender = false;

const SOURCES: ImportSource[] = ['imdb', 'letterboxd', 'tmdb'];
const TOTAL_KEYS = ['rows', 'found', 'missing', 'ignored'];

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    const source = body?.source;
    if (!SOURCES.includes(source)) return json({ ok: false, error: 'Origen no válido' }, 400);
    const fileHash = typeof body?.file_hash === 'string' && /^[0-9a-f]{64}$/.test(body.file_hash) ? body.file_hash : null;
    const totals: Record<string, number> = {};
    for (const k of TOTAL_KEYS) {
        const n = Number(body?.totals?.[k]);
        if (Number.isInteger(n) && n >= 0) totals[k] = n;
    }
    try {
        const id = await createImportJob({ source, label: String(body?.label ?? ''), fileHash, totals });
        return json({ ok: true, id });
    } catch (err) {
        console.error('[api/import/jobs] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo empezar la importación.' }, 500);
    }
};
