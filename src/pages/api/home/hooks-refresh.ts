/**
 * Recarga incremental de la fila «Enganchan desde el primer episodio».
 *
 * Va en un endpoint aparte, y no dentro del render de la portada, porque procesa una página de
 * candidatas = ~20 llamadas a TMDB: metido en el SSR le sumaría segundos a la portada de quien tuviera
 * la mala suerte de abrirla con el documento caducado. Así la portada pinta al instante con lo que hay
 * y la recarga ocurre en una petición aparte, en segundo plano.
 *
 * No necesita sesión: el documento es global y solo contiene datos públicos de TMDB. Y no hace falta
 * protegerlo de llamadas repetidas más allá de lo que ya hace `ensureHooksFresh`, que tiene el guard de
 * 24 h y el claim transaccional: llamarlo mil veces seguidas solo produce mil lecturas de un documento.
 */
import type { APIRoute } from 'astro';
import { ensureHooksFresh } from '../../../services/API/shared/hookRows';

export const POST: APIRoute = async ({ locals }) => {
    const region = locals.user?.region || 'ES';
    try {
        const did = await ensureHooksFresh([region]);
        return json({ ok: true, refreshed: did });
    } catch (err) {
        console.error('[api/home/hooks-refresh]', (err as Error).message);
        return json({ ok: false }, 200); // que falle la recarga no es un error para el cliente
    }
};

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
