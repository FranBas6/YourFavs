/**
 * Cuenta de Trakt (lote F2): leer lo que el usuario tiene en trakt.tv para importarlo.
 *
 *   1 · `newPkce()` + `authorizeUrl()`: Trakt ya no da secreto a las apps nuevas, solo PKCE. Se genera
 *       un verificador aleatorio, se manda a trakt.tv su hash (`code_challenge`, S256) y el usuario
 *       aprueba allí el permiso.
 *   2 · `exchangeCode()`: Trakt vuelve con un `code`, que junto al verificador (sin secreto) se cambia
 *       por un token de acceso. El token vive en una cookie httpOnly de 15 minutos, nunca en la base de
 *       datos, y se revoca en cuanto termina la lectura (`revokeToken`).
 *   3 · `fetchTraktPage()`: una página de lo que haya que leer, normalizada a títulos con su id de TMDB
 *       (Trakt lo da, así que no hay que adivinar nada).
 *
 * Cabeceras de Trakt: `trakt-api-key` (el Client ID), `trakt-api-version: 2` y un `User-Agent` con el
 * nombre de la app (sin él, Cloudflare corta algunas peticiones). Sin `TRAKT_CLIENT_ID` la opción sale
 * como «Pronto». Ojo: la app de Trakt es «Development» y solo admite volver a localhost; para prod hay
 * que pedir a Trakt una app «Production» (`docs/PLAN_TMDB.md`, lote F).
 */
import { createHash, randomBytes } from 'node:crypto';
import { appDateParts } from '../../../utils/appTime';

// Solo en desarrollo: `TRAKT_FAKE_URL` apunta a un Trakt de mentira para probar sin cuenta (lote F2).
// En producción `import.meta.env.DEV` es false y se ignora siempre.
const FAKE = import.meta.env.DEV ? (import.meta.env.TRAKT_FAKE_URL || process.env.TRAKT_FAKE_URL || '') : '';
const AUTH = FAKE || 'https://auth.trakt.tv';
const API = FAKE || 'https://api.trakt.tv';
const USER_AGENT = 'YourFavs/1.0 (+https://yourfavs.netlify.app)';
const TIMEOUT_MS = 10_000;
/** Lo que pide Trakt por página donde hay paginación. */
const PAGE_LIMIT = 100;

const clientId = (): string => import.meta.env.TRAKT_CLIENT_ID ?? '';
export const traktEnabled = (): boolean => Boolean(clientId());

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Verificador (43 caracteres, base64url de 32 bytes), su hash S256 y un `state` contra CSRF. */
export function newPkce(): { verifier: string; challenge: string; state: string } {
    const verifier = b64url(randomBytes(32));
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()), state: b64url(randomBytes(16)) };
}

export function authorizeUrl(redirectUri: string, state: string, challenge: string): string {
    const q = new URLSearchParams({
        response_type: 'code', client_id: clientId(), redirect_uri: redirectUri, state,
        code_challenge: challenge, code_challenge_method: 'S256',
    });
    return `${AUTH}/oauth/authorize?${q}`;
}

async function request<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<{ data: T; pages: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            ...init,
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT,
                'trakt-api-key': clientId(),
                'trakt-api-version': '2',
                ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
            },
        });
        if (!res.ok) throw new Error(`Trakt ${res.status} ${new URL(url).pathname}: ${(await res.text()).slice(0, 160)}`);
        const text = await res.text();
        return { data: (text ? JSON.parse(text) : null) as T, pages: Number(res.headers.get('x-pagination-page-count')) || 1 };
    } finally {
        clearTimeout(timer);
    }
}

/** El `code` de la vuelta + el verificador → token de acceso (sin secreto: PKCE). */
export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<string> {
    const { data } = await request<{ access_token?: string }>(`${AUTH}/oauth/token`, {
        method: 'POST',
        body: JSON.stringify({ code, client_id: clientId(), redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
    });
    if (!data?.access_token) throw new Error('Trakt no devolvió token');
    return data.access_token;
}

/** Se retira el permiso en Trakt. Si falla, el token caduca igualmente a los 7 días. */
export async function revokeToken(token: string): Promise<void> {
    await request(`${AUTH}/oauth/revoke`, { method: 'POST', body: JSON.stringify({ token, client_id: clientId() }) });
}

/** Qué se lee. Las listas: primero el índice (`lists`) y luego cada una (`list`). */
export type TraktKind =
    | 'watched_movies' | 'history_movies'
    | 'ratings_movies' | 'ratings_shows'
    | 'watchlist_movies' | 'watchlist_shows'
    | 'favorites_movies' | 'favorites_shows'
    | 'lists' | 'list';
export const TRAKT_KINDS: TraktKind[] = [
    'watched_movies', 'history_movies', 'ratings_movies', 'ratings_shows',
    'watchlist_movies', 'watchlist_shows', 'favorites_movies', 'favorites_shows', 'lists', 'list',
];

/** Un título de Trakt ya con su id de TMDB. Título y año en inglés: el bueno sale luego de TMDB. */
export interface TraktTitle {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    year: number | null;
    /** YYYY-MM-DD en la zona de la app: cuándo la viste, valoraste o apuntaste. */
    date?: string;
    /** 1-10 (Trakt solo da enteros). */
    rating?: number;
}

export interface TraktPage {
    titles: TraktTitle[];
    /** Sin id de TMDB (raro): no se pueden importar. */
    skipped: number;
    pages: number;
    lists?: { id: number; name: string; description: string; count: number }[];
}

const day = (iso: unknown) => (typeof iso === 'string' && iso ? appDateParts(Date.parse(iso)).key : undefined);

/** Una entrada de Trakt (`{ movie }` o `{ show }`, con sus fechas) → título, o null si no tiene id de TMDB. */
function toTitle(x: any, dateField?: string): TraktTitle | null {
    const media = x?.movie ? 'movie' : x?.show ? 'tv' : null;
    const item = media === 'movie' ? x.movie : x?.show;
    const tmdb = Number(item?.ids?.tmdb);
    if (!media || !tmdb) return null;
    const t: TraktTitle = { media_type: media, tmdb_id: tmdb, title: String(item.title ?? ''), year: Number(item.year) || null };
    const d = dateField ? day(x[dateField]) : undefined;
    if (d) t.date = d;
    const r = Number(x?.rating);
    if (r >= 1 && r <= 10) t.rating = r;
    return t;
}

const PATHS: Record<Exclude<TraktKind, 'lists' | 'list'>, { path: string; date: string; paged: boolean }> = {
    watched_movies: { path: '/sync/watched/movies', date: 'last_watched_at', paged: false },
    history_movies: { path: '/sync/history/movies', date: 'watched_at', paged: true },
    ratings_movies: { path: '/sync/ratings/movies', date: 'rated_at', paged: true },
    ratings_shows: { path: '/sync/ratings/shows', date: 'rated_at', paged: true },
    watchlist_movies: { path: '/sync/watchlist/movies', date: 'listed_at', paged: true },
    watchlist_shows: { path: '/sync/watchlist/shows', date: 'listed_at', paged: true },
    favorites_movies: { path: '/sync/favorites/movies', date: 'listed_at', paged: true },
    favorites_shows: { path: '/sync/favorites/shows', date: 'listed_at', paged: true },
};

export async function fetchTraktPage(token: string, kind: TraktKind, page: number, listId?: number): Promise<TraktPage> {
    const paging = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (kind === 'lists') {
        const { data } = await request<any[]>(`${API}/users/me/lists`, { token });
        return {
            titles: [], skipped: 0, pages: 1,
            lists: (data ?? []).map((l) => ({
                id: Number(l?.ids?.trakt), name: String(l?.name ?? ''), description: String(l?.description ?? ''), count: Number(l?.item_count) || 0,
            })).filter((l) => l.id),
        };
    }
    let url: string;
    let date: string | undefined;
    if (kind === 'list') {
        if (!listId) throw new Error('Falta la lista');
        url = `${API}/users/me/lists/${listId}/items/movie,show?${paging}`;
    } else {
        const p = PATHS[kind];
        url = `${API}${p.path}${p.paged ? `?${paging}` : ''}`;
        date = p.date;
    }
    const { data, pages } = await request<any[]>(url, { token });
    const titles: TraktTitle[] = [];
    let skipped = 0;
    for (const x of data ?? []) {
        const t = toTitle(x, date);
        if (t) titles.push(t); else skipped++;
    }
    return { titles, skipped, pages };
}
