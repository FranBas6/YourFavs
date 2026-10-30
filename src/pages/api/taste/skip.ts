/**
 * POST /api/taste/skip — el usuario omite el onboarding de gustos (Fase F).
 *
 * Marca onboarding='skipped' en el perfil para no volver a forzarlo. Los gustos
 * siguen siendo editables luego desde el perfil; esto solo registra la decisión.
 */
import type { APIRoute } from 'astro';
import { setUserProfile } from '../../../services/BD/profile/userProfile';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        await setUserProfile({ onboarding: 'skipped' });
        return json({ ok: true });
    } catch (err) {
        console.error('[api/taste/skip] error:', (err as Error).message);
        return json({ ok: false }, 500);
    }
};
