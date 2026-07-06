/**
 * GET /api/catalog?section=trending|latest|popular|top&type=movie|tv
 *
 * Secciones de catálogo para la Home de la app (carruseles/rejillas). Reusa las
 * MISMAS funciones que `pages/index.astro` (getTrending, getLatest*, getMostPopular*,
 * getTopRated*) y normaliza al resumen de card (`toItem`, igual que /api/summary).
 *
 * Público (solo dato TMDB). Convención `{ ok, items }`. `?page` opcional (1).
 */
import type { APIRoute } from 'astro';
import { toItem, type SummaryItem } from './summary';
import { getTrending } from '../../services/API/shared/tmdbDiscoverService';
import {
    getLatestMovies,
    getMostPopularMovies,
    getTopRatedMovies,
} from '../../services/API/Movies/tmdbMovies';
import {
    getLatestSeries,
    getMostPopularSeries,
    getTopRatedSeries,
} from '../../services/API/Series/tmdbSeries';

export const prerender = false;

type Section = 'trending' | 'latest' | 'popular' | 'top';
type MediaType = 'movie' | 'tv';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Fetch de la lista TMDB cruda para (section, type). */
async function fetchRaw(section: Section, type: MediaType, page: string): Promise<any[]> {
    if (section === 'trending') return getTrending<any>(type, 'week');
    if (type === 'movie') {
        if (section === 'latest') return getLatestMovies({ page });
        if (section === 'popular') return getMostPopularMovies({ page });
        return getTopRatedMovies({ page }); // top
    }
    if (section === 'latest') return getLatestSeries({ page });
    if (section === 'popular') return getMostPopularSeries({ page });
    return getTopRatedSeries({ page }); // top
}

export const GET: APIRoute = async ({ url }) => {
    const section = url.searchParams.get('section') as Section | null;
    const type = url.searchParams.get('type') as MediaType | null;
    const page = url.searchParams.get('page') || '1';

    if (section !== 'trending' && section !== 'latest' && section !== 'popular' && section !== 'top') {
        return json({ ok: false, error: 'section inválida (trending|latest|popular|top)' }, 400);
    }
    if (type !== 'movie' && type !== 'tv') {
        return json({ ok: false, error: 'type inválido (movie|tv)' }, 400);
    }

    try {
        const raw = await fetchRaw(section, type, page);
        const items: SummaryItem[] = raw
            .map((r) => toItem(r, type))
            .filter((it): it is SummaryItem => it !== null);
        return json({ ok: true, items });
    } catch (err) {
        console.error('[api/catalog GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo cargar el catálogo.' }, 500);
    }
};
