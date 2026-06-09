/**
 * GET /api/taste/options?q=...  — datos para los grids del onboarding (Fase F).
 *
 * Sin `q`: tendencias de la semana (títulos peli/serie interleaved + personas)
 * para poblar los grids iniciales de los pasos 2 y 3.
 * Con `q` (>=2): búsqueda en vivo (TMDB /search/multi) mapeada a la MISMA forma,
 * para que el cliente pinte resultados en el mismo grid.
 *
 * Devuelve los campos que el wizard necesita para mostrar Y para guardar:
 *  - titles: { id, media_type, title, poster_path, image }
 *  - people: { id, name, profile_path, image }
 * (`image` = URL w342 lista para <img>; los demás campos se persisten en taste.)
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
    if (!locals.user) return json({ titles: [], people: [] }, 401);

    const q = (url.searchParams.get('q') || '').trim();

    try {
        // ── Búsqueda en vivo ──────────────────────────────────────────────
        if (q.length >= 2) {
            const data = await tmdbFetch<{ results?: any[] }>('/search/multi', {
                query: q, page: '1', include_adult: 'false',
            }).catch(() => ({ results: [] }));

            const titles: TitleOpt[] = [];
            const people: PersonOpt[] = [];
            for (const raw of data.results || []) {
                if ((raw.media_type === 'movie' || raw.media_type === 'tv') && raw.poster_path) {
                    titles.push(toTitle(raw, raw.media_type));
                } else if (raw.media_type === 'person' && raw.profile_path) {
                    people.push(toPerson(raw));
                }
            }
            return json({ titles: titles.slice(0, CAP_TITLES), people: people.slice(0, CAP_PEOPLE) });
        }

        // ── Tendencias (grids iniciales) ──────────────────────────────────
        const [movies, series, ppl] = await Promise.all([
            getTrending<RawMedia>('movie', 'week').catch(() => []),
            getTrending<RawMedia>('tv', 'week').catch(() => []),
            getTrendingPeople('week').catch(() => []),
        ]);

        // Interleave pelis/series para variedad visual; solo con póster.
        const mt = movies.filter((m) => m.poster_path).map((m) => toTitle(m, 'movie'));
        const tt = series.filter((s) => s.poster_path).map((s) => toTitle(s, 'tv'));
        const titles: TitleOpt[] = [];
        for (let i = 0; i < Math.max(mt.length, tt.length) && titles.length < CAP_TITLES; i++) {
            if (mt[i]) titles.push(mt[i]);
            if (tt[i]) titles.push(tt[i]);
        }

        const people = ppl.slice(0, CAP_PEOPLE).map(toPerson);
        return json({ titles: titles.slice(0, CAP_TITLES), people });
    } catch (err) {
        console.error('[api/taste/options] error:', (err as Error).message);
        return json({ titles: [], people: [] });
    }
};
