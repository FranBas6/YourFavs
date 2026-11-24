/**
 * sitemap.xml (QA 6.4, H74): las páginas fijas, las secciones y categorías del catálogo y los perfiles
 * públicos indexables. Las fichas (películas, series, personas) no van: son cientos de miles y Google
 * las encuentra siguiendo los enlaces del catálogo. Si la base de datos falla, sale sin los perfiles.
 */
import type { APIRoute } from 'astro';
import { allCategories } from '../utils/catalog/categories';
import { LEGAL_PAGES } from '../utils/legal/legalInfo';
import { listIndexableProfiles } from '../services/social/publicProfile';

export const prerender = false;

const STATIC = [
    '/', '/about', '/catalogo', '/catalogo?type=movies', '/catalogo?type=series',
    '/catalogo/maspopulares', '/catalogo/tendencias', '/catalogo/cartelera', '/catalogo/ultimoslanzamientos',
    '/catalogo/topmovies', '/catalogo/topseries', '/catalogo/plataformas', '/catalogo/colecciones',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ url }) => {
    const abs = (path: string) => esc(new URL(path, url.origin).href);
    const entries: string[] = [
        ...STATIC.map((p) => `<url><loc>${abs(p)}</loc></url>`),
        ...allCategories.map((c) => `<url><loc>${abs(`/catalogo/categorias?categoria=${c.slug}`)}</loc></url>`),
        ...LEGAL_PAGES.map((p) => `<url><loc>${abs(p.href)}</loc></url>`),
    ];
    try {
        for (const p of await listIndexableProfiles()) {
            const mod = p.updatedAt ? `<lastmod>${p.updatedAt.slice(0, 10)}</lastmod>` : '';
            entries.push(`<url><loc>${abs(`/u/${encodeURIComponent(p.handle)}`)}</loc>${mod}</url>`);
        }
    } catch (e) {
        console.error('[sitemap] perfiles:', (e as Error).message);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
    return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
};
