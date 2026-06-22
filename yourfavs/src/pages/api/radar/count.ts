import type { APIRoute } from 'astro';
import { getRadar } from '../../../services/API/shared/radar';

export const prerender = false;

/**
 * Nº de novedades del Radar (② · "El salto") para el badge del header / tab móvil.
 * uid de la sesión; `getRadar` está cacheado por uid+día → barato en caliente.
 */
export const GET: APIRoute = async ({ locals }) => {
    const user = locals.user;
    if (!user) return json({ count: 0 });
    try {
        const radar = await getRadar(user.platforms ?? []);
        return json({ count: radar.count }, true);
    } catch {
        return json({ count: 0 });
    }
};

function json(data: unknown, cacheable = false): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...(cacheable ? { 'Cache-Control': 'private, max-age=900' } : {}),
        },
    });
}
