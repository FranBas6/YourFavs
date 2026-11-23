/**
 * POST /api/lists/sagas — seguir o dejar de seguir una saga (2026-11-23, C2).
 *
 *   JSON  { collectionId, action: 'follow' | 'unfollow' }      → { ok, following }
 *   Form  collection_id, op, back                              → 303 a `back` (o a la saga)
 *
 * El botón es un formulario POST de verdad (`SagaFollowButton.astro`): sin sesión, el AuthModal
 * guarda la intención y la repite al entrar con un envío normal, que vuelve aquí como formulario; con
 * sesión, `scripts/library/sagaFollow.ts` lo manda en JSON sin recargar. El uid sale de la sesión.
 */
import type { APIRoute } from 'astro';
import { followCollection, unfollowCollection } from '../../../services/titles/followedCollections';
import { jsonNoStore } from '../../../services/http/http';

export const prerender = false;

/** Solo rutas internas («/…», nunca «//otro-sitio» ni «https://…»). */
const safeBack = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : fallback;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
    const isJson = (request.headers.get('content-type') || '').includes('application/json');
    let collectionId = 0, action = '', back = '';
    if (isJson) {
        const body = await request.json().catch(() => ({}));
        collectionId = Number(body?.collectionId);
        action = String(body?.action || '');
    } else {
        const fd = await request.formData().catch(() => null);
        collectionId = Number(fd?.get('collection_id'));
        action = String(fd?.get('op') || '');
        back = String(fd?.get('back') || '');
    }
    const fallback = Number.isInteger(collectionId) && collectionId > 0 ? `/catalogo/colecciones/${collectionId}` : '/catalogo/colecciones';

    if (!locals.user) {
        return isJson ? jsonNoStore({ ok: false, error: 'No autorizado' }, 401) : redirect('/', 303);
    }
    if (!Number.isInteger(collectionId) || collectionId <= 0 || (action !== 'follow' && action !== 'unfollow')) {
        return isJson ? jsonNoStore({ ok: false, error: 'Petición no válida' }, 400) : redirect(safeBack(back, fallback), 303);
    }
    try {
        if (action === 'follow') {
            const found = await followCollection(collectionId);
            if (!found) return isJson ? jsonNoStore({ ok: false, error: 'Saga no encontrada' }, 404) : redirect('/catalogo/colecciones', 303);
        } else {
            await unfollowCollection(collectionId);
        }
        return isJson ? jsonNoStore({ ok: true, following: action === 'follow' }) : redirect(safeBack(back, fallback), 303);
    } catch (err) {
        console.error('[api/lists/sagas] error:', (err as Error).message);
        return isJson ? jsonNoStore({ ok: false, error: 'No se ha podido guardar.' }, 500) : redirect(safeBack(back, fallback), 303);
    }
};
