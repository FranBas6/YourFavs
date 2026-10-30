/**
 * Cookies de la conexión con la cuenta de TMDB (TMDB D3c). Las dos httpOnly, solo para
 * `/api/import/tmdb/*` y de vida corta:
 *   · `yf_tmdb_rt`: el permiso pedido, mientras el usuario lo aprueba en themoviedb.org (10 min);
 *   · `yf_tmdb_at`: el token de acceso a su cuenta, mientras se lee (15 min). Se revoca en TMDB
 *     y se borra en cuanto termina la lectura (`disconnect`).
 */
import type { AstroCookies } from 'astro';

const PATH = '/api/import/tmdb';
const REQUEST = 'yf_tmdb_rt';
const ACCESS = 'yf_tmdb_at';
const opts = (maxAge: number) => ({ httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, path: PATH, maxAge });

export function setRequestToken(cookies: AstroCookies, token: string) { cookies.set(REQUEST, token, opts(600)); }
export function takeRequestToken(cookies: AstroCookies): string | null {
    const v = cookies.get(REQUEST)?.value ?? null;
    cookies.delete(REQUEST, { path: PATH });
    return v;
}

export function setAccess(cookies: AstroCookies, s: { accessToken: string; accountId: string }) {
    cookies.set(ACCESS, JSON.stringify(s), opts(900));
}
export function getAccess(cookies: AstroCookies): { accessToken: string; accountId: string } | null {
    try {
        const s = JSON.parse(cookies.get(ACCESS)?.value ?? '');
        return typeof s?.accessToken === 'string' && typeof s?.accountId === 'string' ? s : null;
    } catch {
        return null;
    }
}
export function clearAccess(cookies: AstroCookies) { cookies.delete(ACCESS, { path: PATH }); }
