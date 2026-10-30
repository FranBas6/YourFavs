/**
 * POST /api/admin/reports/{id} { action: 'resolve' | 'delete' } → { ok }
 *
 * `/admin/reportes`: dar por revisado un reporte (y los demás del mismo mensaje) o borrar el
 * mensaje para todos. Solo `ADMIN_UIDS`; a cualquier otra persona, 404.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { isAdmin } from '../../../../lib/admin';
import { badRequest, posInt, serverError } from '../../../../lib/social/http';
import { deleteReportedMessage, resolveReport } from '../../../../services/BD/social/reports';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
    if (!isAdmin(locals.user?.uid)) return jsonNoStore({ ok: false, error: 'none' }, 404);
    const id = posInt(params.id);
    const b = await request.json().catch(() => null);
    if (!id || (b?.action !== 'resolve' && b?.action !== 'delete')) return badRequest();
    try {
        if (b.action === 'delete') await deleteReportedMessage(id);
        else await resolveReport(id);
        return jsonNoStore({ ok: true });
    } catch (err) {
        return serverError('api/admin/reports/[id] POST', err);
    }
};
