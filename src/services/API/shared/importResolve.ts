/**
 * De los ids de otras apps a títulos de TMDB (TMDB D3). IMDb: `/find/{tt}?external_source=imdb_id`
 * es exacto, una llamada por título y ya trae título, año y póster en tu idioma, así que la vista
 * previa y la importación no necesitan nada más de TMDB.
 */
import { tmdbFetch } from './tmdbClient';
import { getTitleDetails } from './tmdbTitleCache';
import { processBatch } from '../../../utils/processBatch';

/** Llamadas a la vez dentro de un lote. Un lote de 50 tarda ~1-2 s; TMDB aguanta ~50/s. */
const CONCURRENCY = 25;

export interface ResolvedTitle {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    year: number | null;
    poster_path: string | null;
}

interface FindResponse {
    movie_results?: { id: number; title?: string; release_date?: string; poster_path?: string | null }[];
    tv_results?: { id: number; name?: string; first_air_date?: string; poster_path?: string | null }[];
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/**
 * Cada `tt…` → su título de TMDB, `null` si TMDB no lo tiene (o es un episodio) o `'error'` si la
 * llamada falló (el navegador lo reintenta: no es lo mismo que «no encontrado»). `type` decide solo
 * si TMDB devolviera película y serie a la vez para el mismo id.
 */
export async function resolveImdbIds(rows: { imdb: string; type: 'movie' | 'tv' }[]): Promise<(ResolvedTitle | null | 'error')[]> {
    return processBatch(rows, async ({ imdb, type }): Promise<ResolvedTitle | null | 'error'> => {
        try {
            const r = await tmdbFetch<FindResponse>(`/find/${imdb}`, { external_source: 'imdb_id' });
            const movie = r.movie_results?.[0];
            const tv = r.tv_results?.[0];
            const pick = type === 'tv' ? (tv ? 'tv' : movie ? 'movie' : null) : (movie ? 'movie' : tv ? 'tv' : null);
            if (pick === 'movie' && movie) {
                return { media_type: 'movie', tmdb_id: movie.id, title: movie.title ?? '', year: yearOf(movie.release_date), poster_path: movie.poster_path ?? null };
            }
            if (pick === 'tv' && tv) {
                return { media_type: 'tv', tmdb_id: tv.id, title: tv.name ?? '', year: yearOf(tv.first_air_date), poster_path: tv.poster_path ?? null };
            }
            return null;
        } catch (error) {
            console.error(`[import] /find ${imdb}:`, (error as Error).message);
            return 'error' as const;
        }
    }, CONCURRENCY);
}

/**
 * Trakt (lote F2): ya trae el id de TMDB, así que solo falta el título en tu idioma, el año y el póster.
 * Sale de `tmdb_cache` (la frescura que declara TMDB), una pasada por tipo. `null` = TMDB no lo tiene.
 */
export async function resolveTmdbIds(rows: { tmdb: number; type: 'movie' | 'tv' }[]): Promise<(ResolvedTitle | null)[]> {
    const out: (ResolvedTitle | null)[] = rows.map(() => null);
    for (const type of ['movie', 'tv'] as const) {
        const idx = rows.flatMap((r, i) => (r.type === type ? [i] : []));
        if (!idx.length) continue;
        const details = await getTitleDetails(type, idx.map((i) => rows[i].tmdb));
        idx.forEach((i, k) => {
            const d = details[k];
            if (!d?.id) return;
            out[i] = {
                media_type: type,
                tmdb_id: Number(d.id),
                title: String((type === 'movie' ? d.title : d.name) ?? ''),
                year: yearOf(type === 'movie' ? d.release_date : d.first_air_date),
                poster_path: d.poster_path ?? null,
            };
        });
    }
    return out;
}

// ---------------------------------------------------------------------------------------
// Letterboxd (D3b): sin id, por título y año. Letterboxd usa el título en inglés, así que se busca en
// inglés para comparar y, a la vez, en tu idioma para tener el título con el que se guarda en tus
// colecciones (las colecciones pintan el título guardado).
// ---------------------------------------------------------------------------------------

export interface TitleCandidate { tmdb_id: number; title: string; year: number | null; poster_path: string | null }

export type TitleMatch =
    | { status: 'found'; media_type: 'movie'; tmdb_id: number; title: string; year: number | null; poster_path: string | null }
    | { status: 'ambiguous'; candidates: TitleCandidate[] }
    | { status: 'missing' }
    | { status: 'error' };

interface SearchHit { id: number; title?: string; original_title?: string; release_date?: string; poster_path?: string | null; popularity?: number }

/** Título comparable: sin acentos, signos, «the/a/an» delante ni diferencias «&»/«and». */
export function normTitle(t: string): string {
    return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        .replace(/^(the|a|an) /, '');
}

async function searchMovies(query: string, year: number | null, language: string): Promise<SearchHit[]> {
    const params: Record<string, string> = { query, include_adult: 'false', language };
    if (year) params.primary_release_year = String(year);
    const r = await tmdbFetch<{ results?: SearchHit[] }>('/search/movie', params);
    return r.results ?? [];
}

/**
 * Cada película (título + año de Letterboxd) → encontrada, dudosa (hasta 3 candidatas para que elijas)
 * o no encontrada. Se acepta sola si el título coincide (en inglés o el original) y el año es el mismo
 * o ±1 (los estrenos en festivales cambian de año entre webs).
 */
export async function resolveByTitle(rows: { name: string; year: number | null }[], language: string): Promise<TitleMatch[]> {
    return processBatch(rows, async ({ name, year }): Promise<TitleMatch> => {
        try {
            const want = normTitle(name);
            const sameTitle = (h: SearchHit) => normTitle(h.title ?? '') === want || normTitle(h.original_title ?? '') === want;
            const near = (h: SearchHit) => !year || (yearOf(h.release_date) !== null && Math.abs(yearOf(h.release_date)! - year) <= 1);

            // Con el año exacto primero (lo normal); si no, sin año y con ±1.
            let hits = year ? await searchMovies(name, year, 'en-US') : [];
            let match = hits.find(sameTitle);
            if (!match) {
                hits = await searchMovies(name, null, 'en-US');
                match = hits.find((h) => sameTitle(h) && near(h));
            }

            if (match) {
                // El título en tu idioma (misma búsqueda; si no sale, el inglés).
                let title = match.title ?? name;
                if (!language.startsWith('en')) {
                    const loc = await searchMovies(name, yearOf(match.release_date), language).catch(() => []);
                    title = loc.find((h) => h.id === match!.id)?.title ?? title;
                }
                return { status: 'found', media_type: 'movie', tmdb_id: match.id, title, year: yearOf(match.release_date), poster_path: match.poster_path ?? null };
            }
            if (!hits.length) return { status: 'missing' };
            // Dudosa: las 3 más cercanas en año, y a igualdad, las más populares.
            const dist = (h: SearchHit) => (year && yearOf(h.release_date) !== null ? Math.abs(yearOf(h.release_date)! - year) : 99);
            const candidates = [...hits]
                .sort((a, b) => dist(a) - dist(b) || (b.popularity ?? 0) - (a.popularity ?? 0))
                .slice(0, 3)
                .map((h) => ({ tmdb_id: h.id, title: h.title ?? '', year: yearOf(h.release_date), poster_path: h.poster_path ?? null }));
            return { status: 'ambiguous', candidates };
        } catch (error) {
            console.error(`[import] /search «${name}»:`, (error as Error).message);
            return { status: 'error' };
        }
    }, CONCURRENCY);
}
