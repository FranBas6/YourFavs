/**
 * PATCH /api/profile/collections/{id}/public   { isPublic }
 *
 * Enseña u oculta una colección propia en el perfil público. Solo toca colecciones TUYAS: la RLS
 * y el filtro por `user_id` lo garantizan, y si el id no es tuyo responde 404.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { getOwnPublicSettings, setOwnCollectionPublic } from '../../../../../services/BD/social/publicSettings';
import { invalidatePublicProfileCache } from '../../../../../services/BD/social/publicProfile';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    const id = params.id;
    const body = (await request.json().catch(() => null)) as { isPublic?: unknown } | null;
    if (!id || typeof body?.isPublic !== 'boolean') return jsonNoStore({ ok: false, error: 'Petición no válida' }, 400);
    try {
        const found = await setOwnCollectionPublic(id, body.isPublic);
        if (!found) return jsonNoStore({ ok: false, error: 'Colección no encontrada' }, 404);
        invalidatePublicProfileCache((await getOwnPublicSettings()).handle);
        return jsonNoStore({ ok: true });
    } catch (err) {
        console.error('[api/profile/collections/{id}/public]', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se pudo guardar' }, 500);
    }
};
