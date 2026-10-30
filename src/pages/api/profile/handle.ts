/**
 * GET /api/profile/handle?h=ana_cine — comprobación en vivo del campo de dirección de Ajustes →
 * «Perfil público». No guarda nada.
 *
 *   { ok: true, same? }                       → disponible (o es el tuyo)
 *   { ok: false, reason, availableFrom? }     → 'format' | 'reserved' | 'taken' | 'cooldown'
 *
 * Responde 200 en los dos casos: «ocupado» no es un error de la petición, es la respuesta.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { checkOwnHandle } from '../../../services/BD/social/publicSettings';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    try {
        const res = await checkOwnHandle(url.searchParams.get('h') ?? '');
        return jsonNoStore(res);
    } catch (err) {
        console.error('[api/profile/handle]', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se pudo comprobar' }, 500);
    }
};
