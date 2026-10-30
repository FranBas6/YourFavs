/**
 * Títulos ocultos del perfil público (solo afectan a «Lo último visto» y «Mejor valoradas»).
 *
 *   POST   { mediaType, tmdbId, title?, posterPath? }   → ocultar (perfil, ficha del título)
 *   DELETE { mediaType, tmdbId }                        → volver a mostrar (Ajustes, Deshacer)
 *
 * Los dos son idempotentes: ocultar dos veces o mostrar algo que no estaba oculto no falla.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import {
    PublicSettingsError, getOwnPublicSettings, hideOwnTitle, unhideOwnTitle,
} from '../../../services/BD/social/publicSettings';
import { invalidatePublicProfileCache } from '../../../services/BD/social/publicProfile';

export const prerender = false;

async function run(locals: App.Locals, request: Request, op: 'hide' | 'unhide'): Promise<Response> {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonNoStore({ ok: false, error: 'Petición no válida' }, 400);
    try {
        const ref = { mediaType: body.mediaType, tmdbId: body.tmdbId };
        if (op === 'hide') await hideOwnTitle({ ...ref, title: body.title, posterPath: body.posterPath });
        else await unhideOwnTitle(ref);
        invalidatePublicProfileCache((await getOwnPublicSettings()).handle);
        return jsonNoStore({ ok: true });
    } catch (err) {
        if (err instanceof PublicSettingsError) return jsonNoStore({ ok: false, error: err.message }, err.status);
        console.error('[api/profile/hidden]', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se pudo guardar' }, 500);
    }
}

export const POST: APIRoute = ({ locals, request }) => run(locals, request, 'hide');
export const DELETE: APIRoute = ({ locals, request }) => run(locals, request, 'unhide');
