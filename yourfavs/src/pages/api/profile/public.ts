/**
 * PATCH /api/profile/public — guarda los ajustes del perfil público (Ajustes → «Perfil público»).
 *
 * Body PARCIAL de `{ handle, visibility, bio, four, sections, indexable }`: solo se escribe lo que
 * llega, como el resto de Ajustes. Toda la validación está en `publicSettings.ts`:
 *   · 400 formato / reservado / bio larga / publicar sin dirección (`code: 'handle_required'`)
 *   · 409 dirección ocupada · 423 dirección en enfriamiento (con `availableFrom`)
 *   · «Solo amigos» se rechaza mientras `SOCIAL_PHASE.friends` esté apagado.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { PublicSettingsError, getOwnPublicSettings, updatePublicSettings } from '../../../services/BD/social/publicSettings';
import { invalidatePublicProfileCache } from '../../../services/BD/social/publicProfile';

export const prerender = false;

const ALLOWED = ['handle', 'visibility', 'bio', 'four', 'sections', 'indexable'] as const;

export const PATCH: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return jsonNoStore({ ok: false, error: 'Petición no válida' }, 400);
    const patch: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) patch[k] = body[k];
    if (!Object.keys(patch).length) return jsonNoStore({ ok: false, error: 'Nada que guardar' }, 400);

    try {
        const before = await getOwnPublicSettings();
        const settings = await updatePublicSettings(patch);
        // Lo que vean los visitantes en ESTA instancia deja de valer ya: el handle viejo tiene que
        // dar 404 y un perfil apagado no puede seguir sirviéndose desde la caché.
        invalidatePublicProfileCache(before.handle);
        invalidatePublicProfileCache(settings.handle);
        return jsonNoStore({ ok: true, settings });
    } catch (err) {
        if (err instanceof PublicSettingsError) {
            return jsonNoStore({ ok: false, error: err.message, code: err.code, ...err.extra }, err.status);
        }
        console.error('[api/profile/public]', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se pudo guardar' }, 500);
    }
};
