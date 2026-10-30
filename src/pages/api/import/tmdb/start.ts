/**
 * GET /api/import/tmdb/start — «Conectar con TMDB» (TMDB D3c): pide un permiso a TMDB y manda al
 * usuario a themoviedb.org a aprobarlo; TMDB lo devuelve a `/api/import/tmdb/callback`.
 */
import type { APIRoute } from 'astro';
import { approveUrl, createRequestToken, tmdbAccountEnabled } from '../../../../services/API/shared/tmdbAccount';
import { setRequestToken } from './_session';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, locals, redirect }) => {
    if (!locals.user) return redirect('/');
    if (!tmdbAccountEnabled()) return redirect('/perfil/importar');
    try {
        const token = await createRequestToken(`${url.origin}/api/import/tmdb/callback`);
        setRequestToken(cookies, token);
        return redirect(approveUrl(token));
    } catch (err) {
        console.error('[api/import/tmdb/start] error:', (err as Error).message);
        return redirect('/perfil/importar?tmdb=error');
    }
};
