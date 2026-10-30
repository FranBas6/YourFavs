/**
 * GET /api/taste/options?q=...  — datos para los grids del onboarding (Fase F.7).
 *
 * Pelis y series van SEPARADAS (pasos distintos del wizard):
 *  - movieTitles / tvTitles: { id, media_type, title, poster_path, image }
 *  - people: { id, name, profile_path, image }
 * (`image` = URL w342 lista para <img>; los demás campos se persisten en taste.)
 *
 * Sin `q`: tendencias de la semana (cine, TV y personas). Con `q` (>=2):
 * búsqueda en vivo (TMDB /search/multi) repartida por media_type. Mismas
 * llamadas TMDB que antes (getTrending movie+tv + getTrendingPeople).
 *
 * Patrón de endpoint como avatar-options.ts: prerender=false, guard locals.user.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl } from '../../../services/API/shared/tmdbClient';
import { getTrending, getTrendingPeople } from '../../../services/API/shared/tmdbDiscoverService';

export const prerender = false;

const CAP_TITLES = 24;
const CAP_PEOPLE = 24;

interface TitleOpt { id: number; media_type: 'movie' | 'tv'; title: string; poster_path: string | null; image: string | null; }
interface PersonOpt { id: number; name: string; profile_path: string | null; image: string | null; }

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

interface RawMedia { id: number; title?: string; name?: string; poster_path?: string | null; profile_path?: string | null; }

const toTitle = (raw: RawMedia, media_type: 'movie' | 'tv'): TitleOpt => ({
    id: raw.id,
    media_type,
    title: (media_type === 'movie' ? raw.title : raw.name) || '',
    poster_path: raw.poster_path ?? null,
    image: raw.poster_path ? posterUrl(raw.poster_path, 'w342') : null,
});

const toPerson = (raw: RawMedia): PersonOpt => ({
    id: raw.id,
    name: raw.name || '',
    profile_path: raw.profile_path ?? null,
    image: raw.profile_path ? posterUrl(raw.profile_path, 'w342') : null,
});

export const GET: APIRoute = async ({ locals, url }) => {
    if (!locals.user) return json({ movieTitles: [], tvTitles: [], people: [] }, 401);

    const q = (url.searchParams.get('q') || '').trim();

    try {
        // ── Búsqueda en vivo ──────────────────────────────────────────────
        if (q.length >= 2) {
            const data = await tmdbFetch<{ results?: any[] }>('/search/multi', {
                query: q, page: '1', include_adult: 'false',
            }).catch(() => ({ results: [] }));

            const movieTitles: TitleOpt[] = [];
            const tvTitles: TitleOpt[] = [];
            const people: PersonOpt[] = [];
            for (const raw of data.results || []) {
                if (raw.media_type === 'movie' && raw.poster_path) movieTitles.push(toTitle(raw, 'movie'));
                else if (raw.media_type === 'tv' && raw.poster_path) tvTitles.push(toTitle(raw, 'tv'));
                else if (raw.media_type === 'person' && raw.profile_path) people.push(toPerson(raw));
            }
            return json({
                movieTitles: movieTitles.slice(0, CAP_TITLES),
                tvTitles: tvTitles.slice(0, CAP_TITLES),
                people: people.slice(0, CAP_PEOPLE),
            });
        }

        // ── Tendencias (grids iniciales) ──────────────────────────────────
        const [movies, series, ppl] = await Promise.all([
            getTrending<RawMedia>('movie', 'week').catch(() => []),
            getTrending<RawMedia>('tv', 'week').catch(() => []),
            getTrendingPeople('week').catch(() => []),
        ]);

        const movieTitles = movies.filter((m) => m.poster_path).slice(0, CAP_TITLES).map((m) => toTitle(m, 'movie'));
        const tvTitles = series.filter((s) => s.poster_path).slice(0, CAP_TITLES).map((s) => toTitle(s, 'tv'));
        const people = ppl.slice(0, CAP_PEOPLE).map(toPerson);
        return json({ movieTitles, tvTitles, people });
    } catch (err) {
        console.error('[api/taste/options] error:', (err as Error).message);
        return json({ movieTitles: [], tvTitles: [], people: [] });
    }
};
