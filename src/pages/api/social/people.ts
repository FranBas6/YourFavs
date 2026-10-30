/**
 * GET /api/social/people?q=ana&limit=20 → { ok, items: PersonEntry[] }
 *
 * Buscar personas para el centro «Amigos» (hasta 20) y el ⌘K (hasta 8). Solo perfiles activos,
 * nunca tú ni nadie con quien haya un bloqueo, por nombre o @dirección. Con menos de 2
 * caracteres devuelve una lista vacía. Nadie sabe a quién buscas: no se guarda nada.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { serverError, tooMany, unauthorized } from '../../../lib/social/http';
import { allowSocialWrite, searchPeople } from '../../../services/BD/social/graph';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const q = (url.searchParams.get('q') ?? '').slice(0, 60);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 20);
    // Un tope propio, más holgado que el de las escrituras: se busca mientras se escribe.
    if (!allowSocialWrite(`search:${me}`, 60)) return tooMany();
    try {
        return jsonNoStore({ ok: true, items: await searchPeople(me, q, limit) });
    } catch (err) {
        return serverError('api/social/people', err);
    }
};
