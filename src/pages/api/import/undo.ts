/**
 * POST /api/import/undo — deshace una importación entera (TMDB D3). Solo lo que ella hizo y sigue
 * como lo dejó: ver `import_undo` en la migración `20261105090000_import_jobs`.
 */
import type { APIRoute } from 'astro';
import { undoImport } from '../../../services/BD/import/importLibrary';
import { json, isUuid } from './_shared';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.job_id)) return json({ ok: false, error: 'Importación no válida' }, 400);
    try {
        const result = await undoImport(body.job_id);
        return json({ ok: true, ...result });
    } catch (err) {
        console.error('[api/import/undo] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo deshacer.' }, 500);
    }
};
