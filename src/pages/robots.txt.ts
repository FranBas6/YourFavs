/**
 * robots.txt (QA 6.4, H74; cerrado el 2026-11-27 tras un rastreo masivo: ~180.000 ejecuciones de función en
 * un día, el 100 % de robots).
 *
 * YourFavs tiene páginas casi infinitas (cada título, persona, temporada, episodio, palabra clave y cada página
 * y filtro del catálogo), y cada una se genera en el servidor: un robot que lo siga todo agota el plan. Así:
 *   · Robots de IA y de SEO: fuera del todo. Rastrean para entrenar o vender datos, no traen visitas.
 *   · El resto (Google, Bing…): portada, catálogo principal, fichas de película y serie, actores, perfiles
 *     públicos y páginas legales; NO las direcciones con «?» (páginas 2…500, filtros, órdenes), temporadas,
 *     episodios, palabras clave, equipo ni productoras, que son las que se multiplican sin fin.
 *
 * Es una petición, no un candado: los robots serios hacen caso; a los que no, hay que cortarlos en Netlify.
 * Que algo no esté aquí no lo hace privado: lo privado ya exige sesión o lleva `noindex`.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

/** Robots de IA (entrenamiento y respuestas) y de SEO, que no traen visitas y rastrean muy fuerte. */
const BLOCKED_BOTS = [
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Claude-SearchBot',
    'CCBot', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'Meta-ExternalAgent', 'FacebookBot',
    'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'cohere-ai', 'cohere-training-data-crawler',
    'Diffbot', 'ImagesiftBot', 'Omgilibot', 'YouBot', 'Timpibot', 'PetalBot', 'AI2Bot', 'Ai2Bot-Dolma',
    'SemrushBot', 'AhrefsBot', 'MJ12bot', 'DotBot', 'DataForSeoBot', 'BLEXBot', 'serpstatbot', 'Barkrowler',
];

/** Para todos los demás: lo personal o técnico, y lo que se multiplica sin fin. */
const DISALLOW = [
    '/mislistas', '/perfil', '/gustos', '/api/', '/auth/', '/admin', '/dev/',
    '/*?',                  // páginas, filtros y órdenes del catálogo; búsquedas
    '/catalogo/busqueda',
    '/catalogo/keyword/',
    '/catalogo/fila/',
    '/serie/*/t',           // temporadas y episodios (/serie/1399/t1, /serie/1399/t1/e1)
    '/serie/*/episodios/',
    '/team/',
    '/productora/',
];

export const GET: APIRoute = ({ url }) => {
    const body = [
        ...BLOCKED_BOTS.flatMap((b) => [`User-agent: ${b}`]),
        'Disallow: /',
        '',
        'User-agent: *',
        ...DISALLOW.map((p) => `Disallow: ${p}`),
        // Bing, Yandex y otros respetan una pausa entre peticiones (Google no: él se regula solo).
        'Crawl-delay: 10',
        '',
        `Sitemap: ${new URL('/sitemap.xml', url.origin).href}`,
        '',
    ].join('\n');
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
};
