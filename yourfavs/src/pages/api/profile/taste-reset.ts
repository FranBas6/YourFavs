/**
 * POST /api/profile/taste-reset — borra los gustos del onboarding (géneros, títulos, actores).
 *
 * Extraído del POST con recarga que vivía en `perfil.astro`, para que el panel de Ajustes lo
 * haga sin salir de la página. Los gustos son SEMILLA del motor de recomendaciones, así que
 * hay que invalidar sus cachés: si no, "Para ti" seguiría recomendando por unos gustos que ya
 * no existen hasta que caducara el blob.
 */
import type { APIRoute } from 'astro';
import { clearUserTaste } from '../../../services/BD/profile/userTaste';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        await clearUserTaste();
        try {
            const [{ invalidateGenrePreferencesCache }, { invalidatePersonalRecsCache }] = await Promise.all([
                import('../../../utils/genrePreferences'),
                import('../../../utils/personalRecommendations'),
            ]);
            invalidateGenrePreferencesCache();
            invalidatePersonalRecsCache();
        } catch { /* la caché caduca sola igualmente */ }
        return json({ ok: true });
    } catch (err) {
        console.error('[api/profile/taste-reset] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo reiniciar' }, 500);
    }
};
