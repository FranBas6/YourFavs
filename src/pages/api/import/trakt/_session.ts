/**
 * Cookies de la conexión con Trakt (lote F2). httpOnly, solo para `/api/import/trakt/*` y de vida corta:
 *   · `yf_trakt_pk`: el verificador PKCE y el `state` mientras el usuario aprueba en trakt.tv (10 min);
 *   · `yf_trakt_at`: el token de acceso mientras se lee (15 min). Se revoca y se borra al terminar.
 */
import type { AstroCookies } from 'astro';

const PATH = '/api/import/trakt';
const PKCE = 'yf_trakt_pk';
const ACCESS = 'yf_trakt_at';
const opts = (maxAge: number) => ({ httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, path: PATH, maxAge });

export function setPkce(cookies: AstroCookies, p: { verifier: string; state: string }) { cookies.set(PKCE, JSON.stringify(p), opts(600)); }
export function takePkce(cookies: AstroCookies): { verifier: string; state: string } | null {
    const raw = cookies.get(PKCE)?.value ?? '';
    cookies.delete(PKCE, { path: PATH });
    try {
        const p = JSON.parse(raw);
        return typeof p?.verifier === 'string' && typeof p?.state === 'string' ? p : null;
    } catch {
        return null;
    }
}

export function setAccess(cookies: AstroCookies, token: string) { cookies.set(ACCESS, token, opts(900)); }
export function getAccess(cookies: AstroCookies): string | null { return cookies.get(ACCESS)?.value || null; }
export function clearAccess(cookies: AstroCookies) { cookies.delete(ACCESS, { path: PATH }); }
