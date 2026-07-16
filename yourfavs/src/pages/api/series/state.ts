/**
 * POST /api/series/state — cambia el estado de una serie SIN salir de la página.
 *
 * Lo usa el bloque "¿Retomamos alguna?" de la Home para "Abandonar" en optimista
 * (fetch → la tarjeta se desvanece, el usuario se queda en la Home). Reusa
 * `handleSerieFavAction`. Body JSON: { id, actionType, action }. Invitado → 401.
 */
import type { APIRoute } from 'astro';
import { handleSerieFavAction } from '../../../services/BD/series/yourfavsSerie';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const id = String(body?.id || '');
        const actionType = String(body?.actionType || '');
        const action = String(body?.action || '');
        if (!id || !actionType || !action) return json({ ok: false, error: 'Faltan campos' }, 400);

        const fd = new FormData();
        fd.set('id', id);
        fd.set('actionType', actionType);
        fd.set('action', action);
        await handleSerieFavAction(fd);
        return json({ ok: true });
    } catch (err) {
        console.error('[api/series/state POST] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo actualizar.' }, 500);
    }
};
