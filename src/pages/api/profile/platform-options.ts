/**
 * GET /api/profile/platform-options — catálogo de plataformas de TU región, para el selector
 * de «Añadir plataforma».
 *
 * Se carga bajo demanda (al abrir el selector) en vez de embutirlo en el HTML de Ajustes: son
 * ~87 entradas para España y la mayoría de visitas a la página no lo abren nunca.
 *
 * La región sale de la sesión (`locals.user.region`), no de la query: es la misma que usan
 * `tmdbFetch` y los proveedores de las fichas, así que el selector ofrece exactamente lo que
 * el resto de la app va a poder cruzar.
 */
import type { APIRoute } from 'astro';
import { getRegionProviders } from '../../../services/API/shared/watchProviders';

export const prerender = false;

function json(data: unknown, status = 200, cache = false): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // Un catálogo de plataformas cambia de mes en mes; una hora en el navegador
            // ahorra la ida y vuelta si abres el selector varias veces.
            ...(cache ? { 'Cache-Control': 'private, max-age=3600' } : {}),
        },
    });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const region = (locals.user as { region?: string }).region || 'ES';
        const providers = await getRegionProviders(region);
        return json({ ok: true, region, providers }, 200, true);
    } catch (err) {
        console.error('[api/profile/platform-options] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo cargar el catálogo' }, 500);
    }
};
