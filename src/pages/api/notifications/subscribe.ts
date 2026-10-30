/**
 * POST /api/notifications/subscribe — «Avisarme del estreno» sin recargar (TMDB D4, ficha de episodio).
 *
 * Body { media_type: 'movie' | 'tv', tmdb_id, on: boolean }. Es la misma suscripción que el botón
 * «Notificar estreno» de las fichas (`NotificationBell`, que va por POST de formulario).
 */
import type { APIRoute } from 'astro';
import { addNotificationSub, removeNotificationSub } from '../../../services/BD/notifications/yourfavsNotifications';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    const body = await request.json().catch(() => null);
    const mediaType = body?.media_type;
    const tmdbId = String(body?.tmdb_id ?? '');
    if ((mediaType !== 'movie' && mediaType !== 'tv') || !/^\d+$/.test(tmdbId)) return json({ ok: false, error: 'Parámetros inválidos' }, 400);
    try {
        if (body?.on === true) await addNotificationSub(mediaType, tmdbId);
        else await removeNotificationSub(mediaType, tmdbId);
        return json({ ok: true, on: body?.on === true });
    } catch (err) {
        console.error('[api/notifications/subscribe] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar.' }, 500);
    }
};
