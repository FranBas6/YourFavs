/**
 * robots.txt (QA 6.4, H74). Deja indexar lo público (portada, catálogo, fichas, personas, perfiles
 * públicos) y aparta lo personal o técnico. Que algo no esté aquí no lo hace privado: lo privado ya
 * exige sesión (middleware) o lleva `noindex`; esto solo evita que los buscadores pierdan el tiempo.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const PRIVATE = ['/mislistas', '/perfil', '/gustos', '/api/', '/auth/', '/admin', '/dev/', '/catalogo/busqueda'];

export const GET: APIRoute = ({ url }) => {
    const body = [
        'User-agent: *',
        ...PRIVATE.map((p) => `Disallow: ${p}`),
        '',
        `Sitemap: ${new URL('/sitemap.xml', url.origin).href}`,
        '',
    ].join('\n');
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
    });
};
