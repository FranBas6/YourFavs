/**
 * POST /api/profile/preferences — guarda preferencias sueltas (región/tema/idioma)
 * desde el menú de cuenta, sin recargar ni navegar al perfil. Body JSON parcial.
 */
import type { APIRoute } from 'astro';
import { setUserProfile, type UserProfile } from '../../../services/BD/profile/userProfile';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const patch: Partial<UserProfile> = {};
        if (typeof body.region === 'string' && body.region) patch.region = body.region;
        if (typeof body.language === 'string' && body.language) patch.language = body.language;
        if (body.theme === 'light' || body.theme === 'dark' || body.theme === 'system') patch.theme = body.theme;
        if (Object.keys(patch).length === 0) return json({ ok: false, error: 'Nada que guardar' }, 400);
        await setUserProfile(patch);
        return json({ ok: true });
    } catch (err) {
        console.error('[api/profile/preferences] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar' }, 500);
    }
};
