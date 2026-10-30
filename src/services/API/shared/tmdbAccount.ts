/**
 * Importar desde la cuenta de TMDB del usuario (TMDB D3c), con la API v4.
 *
 *   1 · `createRequestToken(redirectTo)`: con NUESTRO token de lectura (`TMDB_READ_TOKEN`) se pide
 *       un permiso y el usuario lo aprueba en themoviedb.org (`approveUrl`).
 *   2 · `createAccessToken(requestToken)`: al volver, el permiso aprobado se cambia por un token
 *       de acceso a SU cuenta (solo lectura de lo que se pide aquí) y su `account_id`.
 *   3 · `fetchAccountPage`: favoritos, watchlist, valoradas y listas, página a página.
 *   4 · `revokeAccessToken`: en cuanto se ha leído todo, el token se revoca en TMDB. No se guarda
 *       en ningún sitio más que en una cookie httpOnly de 15 minutos mientras dura la lectura.
 *
 * Nunca se escribe en la cuenta de TMDB.
 */
const V4 = 'https://api.themoviedb.org/4';
const TIMEOUT_MS = 8000;

export const tmdbAccountEnabled = (): boolean => Boolean(import.meta.env.TMDB_READ_TOKEN);
export const approveUrl = (requestToken: string) =>
    `https://www.themoviedb.org/auth/access?request_token=${encodeURIComponent(requestToken)}`;

async function v4<T>(path: string, init: { method?: string; bearer: string; body?: unknown; query?: Record<string, string> }): Promise<T> {
    const url = new URL(`${V4}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: init.method ?? 'GET',
            headers: { Authorization: `Bearer ${init.bearer}`, 'Content-Type': 'application/json;charset=utf-8' },
            body: init.body ? JSON.stringify(init.body) : undefined,
            signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`TMDB v4 ${res.status} ${path}: ${(data as any)?.status_message ?? ''}`);
        return data as T;
    } finally {
        clearTimeout(timer);
    }
}

const readToken = (): string => {
    const t = import.meta.env.TMDB_READ_TOKEN;
    if (!t) throw new Error('Falta TMDB_READ_TOKEN');
    return t;
};

export async function createRequestToken(redirectTo: string): Promise<string> {
    const r = await v4<{ request_token?: string }>('/auth/request_token', {
        method: 'POST', bearer: readToken(), body: { redirect_to: redirectTo },
    });
    if (!r.request_token) throw new Error('TMDB no devolvió request_token');
    return r.request_token;
}

export async function createAccessToken(requestToken: string): Promise<{ accessToken: string; accountId: string }> {
    const r = await v4<{ access_token?: string; account_id?: string }>('/auth/access_token', {
        method: 'POST', bearer: readToken(), body: { request_token: requestToken },
    });
    if (!r.access_token || !r.account_id) throw new Error('Permiso no aprobado');
    return { accessToken: r.access_token, accountId: r.account_id };
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
    await v4('/auth/access_token', { method: 'DELETE', bearer: readToken(), body: { access_token: accessToken } });
}

/** Qué se lee de la cuenta. Las listas, primero el índice (`lists`) y luego cada una (`list`). */
export type AccountKind =
    | 'movie_favorites' | 'tv_favorites' | 'movie_watchlist' | 'tv_watchlist' | 'movie_rated' | 'tv_rated'
    | 'lists' | 'list';

export const ACCOUNT_KINDS: AccountKind[] = [
    'movie_favorites', 'tv_favorites', 'movie_rated', 'tv_rated', 'movie_watchlist', 'tv_watchlist', 'lists', 'list',
];

export interface AccountTitle {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    year: number | null;
    poster_path: string | null;
    /** Solo en valoradas: la nota (0,5-10) y cuándo la puso. */
    rating?: number;
    rated_on?: string;
}

export interface AccountPage {
    titles: AccountTitle[];
    /** Solo en `lists`: el índice de listas. */
    lists?: { id: number; name: string; description: string; count: number }[];
    totalPages: number;
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

function toTitle(r: any, fallback: 'movie' | 'tv'): AccountTitle | null {
    const media_type: 'movie' | 'tv' = r?.media_type === 'tv' || r?.media_type === 'movie' ? r.media_type : fallback;
    if (!Number.isInteger(r?.id)) return null;
    const t: AccountTitle = {
        media_type,
        tmdb_id: r.id,
        title: (media_type === 'tv' ? r.name : r.title) ?? r.title ?? r.name ?? '',
        year: yearOf(media_type === 'tv' ? r.first_air_date : r.release_date),
        poster_path: r.poster_path ?? null,
    };
    const value = Number(r?.account_rating?.value);
    if (value > 0) {
        t.rating = value;
        const at = String(r.account_rating.created_at ?? '');
        if (/^\d{4}-\d{2}-\d{2}/.test(at)) t.rated_on = at.slice(0, 10);
    }
    return t;
}

/** Una página de lo que se pide. `listId` solo para `list`. */
export async function fetchAccountPage(
    session: { accessToken: string; accountId: string },
    kind: AccountKind,
    page: number,
    language: string,
    listId?: number,
): Promise<AccountPage> {
    const query = { page: String(page), language };
    const bearer = session.accessToken;
    const acc = `/account/${encodeURIComponent(session.accountId)}`;

    if (kind === 'lists') {
        const r = await v4<any>(`${acc}/lists`, { bearer, query });
        return {
            titles: [],
            lists: (r.results ?? []).map((l: any) => ({
                id: Number(l.id), name: String(l.name ?? ''), description: String(l.description ?? ''), count: Number(l.number_of_items) || 0,
            })),
            totalPages: Number(r.total_pages) || 1,
        };
    }
    if (kind === 'list') {
        if (!listId) throw new Error('Falta la lista');
        const r = await v4<any>(`/list/${listId}`, { bearer, query });
        return { titles: (r.results ?? []).map((x: any) => toTitle(x, 'movie')).filter(Boolean), totalPages: Number(r.total_pages) || 1 };
    }
    const [media, what] = kind.split('_') as ['movie' | 'tv', 'favorites' | 'watchlist' | 'rated'];
    const r = await v4<any>(`${acc}/${media}/${what}`, { bearer, query });
    return { titles: (r.results ?? []).map((x: any) => toTitle(x, media)).filter(Boolean), totalPages: Number(r.total_pages) || 1 };
}
