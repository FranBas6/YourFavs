/**
 * GET /api/taste/options?q=...  — datos para los grids del onboarding (Fase F.7).
 *
 * Pelis y series van SEPARADAS (pasos distintos del wizard):
 *  - movieTitles / tvTitles: { id, media_type, title, poster_path, image }
 *  - people: { id, name, profile_path, image }
 * (`image` = URL w342 lista para <img>; los demás campos se persisten en taste.)
 *
 * Sin `q` (QA 2.2, H13): lo que más gente ha visto y valorado bien DE LOS GÉNEROS ELEGIDOS en el paso 1
 * (`?genres=28,18`, ids de cine; los de TV salen de `TASTE_GENRES`), ya estrenado. Antes eran las
 * tendencias de la semana: estrenos que aún no habían salido y nada que ver con tus géneros. Personas:
 * reparto y dirección de esas mismas propuestas (antes, desconocidos de tendencias).
 * Con `q` (>=2): búsqueda en vivo (TMDB /search/multi) repartida por media_type.
 * Todas las opciones de título llevan `year` (H14: cinco «Zodiac» iguales).
 *
 * Patrón de endpoint como avatar-options.ts: prerender=false, guard locals.user.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl } from '../../../services/tmdb/tmdbClient';
import { TASTE_GENRES } from '../../../utils/titles/tasteGenres';

export const prerender = false;

const CAP_TITLES = 24;
const CAP_PEOPLE = 24;

interface TitleOpt { id: number; media_type: 'movie' | 'tv'; title: string; poster_path: string | null; image: string | null; year: string | null; }
interface PersonOpt { id: number; name: string; profile_path: string | null; image: string | null; }

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

interface RawMedia { id: number; title?: string; name?: string; poster_path?: string | null; profile_path?: string | null; release_date?: string; first_air_date?: string; }

const toTitle = (raw: RawMedia, media_type: 'movie' | 'tv'): TitleOpt => ({
    id: raw.id,
    media_type,
    title: (media_type === 'movie' ? raw.title : raw.name) || '',
    poster_path: raw.poster_path ?? null,
    image: raw.poster_path ? posterUrl(raw.poster_path, 'w342') : null,
    year: ((media_type === 'movie' ? raw.release_date : raw.first_air_date) || '').slice(0, 4) || null,
});

/** Mínimo de votos para proponer algo: clásicos y éxitos que mucha gente ha visto. */
const MIN_VOTES = { movie: 3000, tv: 800 };
async function discoverTop(media: 'movie' | 'tv', genres: string | null, page = 1): Promise<RawMedia[]> {
    const today = new Date().toISOString().slice(0, 10);
    const params: Record<string, string> = {
        sort_by: 'vote_count.desc',
        'vote_average.gte': '7',
        'vote_count.gte': String(MIN_VOTES[media]),
        include_adult: 'false',
        [media === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte']: today,
    };
    if (genres) params.with_genres = genres;
    const r = await tmdbFetch<{ results?: RawMedia[] }>(`/discover/${media}`, { ...params, page: String(page) }).catch(() => ({ results: [] }));
    return r.results ?? [];
}

/**
 * Lo más visto y bien valorado de los géneros elegidos, ALTERNANDO género a género: con «Terror + Drama»
 * por número de votos solo salían dramas. Sin géneros (o sin pareja en TV), lo más visto de siempre.
 */
async function classics(media: 'movie' | 'tv', genres: number[]): Promise<RawMedia[]> {
    if (!genres.length) return (await Promise.all([1, 2].map((pg) => discoverTop(media, null, pg)))).flat();
    const lists = await Promise.all(genres.slice(0, 6).map((g) => discoverTop(media, String(g))));
    const out: RawMedia[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
        for (const l of lists) {
            const x = l[i];
            if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); }
        }
    }
    return out;
}

/** Personas: reparto principal y dirección de las primeras propuestas (conocidas y de tus géneros). */
async function peopleFrom(movies: RawMedia[], series: RawMedia[]): Promise<RawMedia[]> {
    const picks: ['movie' | 'tv', number][] = [
        ...movies.slice(0, 8).map((m) => ['movie', m.id] as ['movie', number]),
        ...series.slice(0, 4).map((s) => ['tv', s.id] as ['tv', number]),
    ];
    const credits = await Promise.all(picks.map(([mt, id]) =>
        tmdbFetch<{ cast?: any[]; crew?: any[] }>(`/${mt}/${id}/credits`).catch(() => ({ cast: [], crew: [] }))));
    const byId = new Map<number, any>();
    // Alterna título a título: el protagonista de cada una antes que el reparto secundario de la primera.
    for (let i = 0; i < 4; i++) {
        for (const c of credits) {
            const x = (c.cast ?? [])[i];
            if (x?.profile_path && !byId.has(x.id)) byId.set(x.id, x);
        }
    }
    for (const c of credits) {
        const d = (c.crew ?? []).find((x: any) => x.job === 'Director' && x.profile_path);
        if (d && !byId.has(d.id)) byId.set(d.id, d);
    }
    return [...byId.values()];
}

const toPerson = (raw: RawMedia): PersonOpt => ({
    id: raw.id,
    name: raw.name || '',
    profile_path: raw.profile_path ?? null,
    image: raw.profile_path ? posterUrl(raw.profile_path, 'w342') : null,
});

export const GET: APIRoute = async ({ locals, url }) => {
    if (!locals.user) return json({ movieTitles: [], tvTitles: [], people: [] }, 401);

    const q = (url.searchParams.get('q') || '').trim();
    // Géneros del paso 1 (ids de cine); los de TV, de su pareja en TASTE_GENRES (si la tiene).
    const movieGenres = (url.searchParams.get('genres') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
    const tvGenres = [...new Set(movieGenres.map((g) => TASTE_GENRES.find((t) => t.movie === g)?.tv).filter((n): n is number => !!n))];

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

        // ── Propuestas iniciales: lo más visto y bien valorado de tus géneros ──
        const [movies, series] = await Promise.all([
            classics('movie', movieGenres),
            // Si ninguno de tus géneros tiene pareja en TV (Terror, Romance…), lo más visto de siempre.
            classics('tv', tvGenres),
        ]);
        const ppl = await peopleFrom(movies.filter((m) => m.poster_path), series.filter((s) => s.poster_path));

        const movieTitles = movies.filter((m) => m.poster_path).slice(0, CAP_TITLES).map((m) => toTitle(m, 'movie'));
        const tvTitles = series.filter((s) => s.poster_path).slice(0, CAP_TITLES).map((s) => toTitle(s, 'tv'));
        const people = ppl.slice(0, CAP_PEOPLE).map(toPerson);
        return json({ movieTitles, tvTitles, people });
    } catch (err) {
        console.error('[api/taste/options] error:', (err as Error).message);
        return json({ movieTitles: [], tvTitles: [], people: [] });
    }
};
