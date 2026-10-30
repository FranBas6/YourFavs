/**
 * GET /api/import/tmdb/callback — vuelta desde themoviedb.org (TMDB D3c). Si el usuario aprobó, el
 * permiso se cambia por un token de acceso a su cuenta (cookie httpOnly de 15 min) y vuelve a
 * Ajustes → Importar, que empieza a leer sola. Si no lo aprobó, vuelve con un aviso.
 */
import type { APIRoute } from 'astro';
import { createAccessToken } from '../../../../services/API/shared/tmdbAccount';
import { setAccess, takeRequestToken } from './_session';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, locals, redirect, url }) => {
    if (!locals.user) return redirect('/');
    const requestToken = takeRequestToken(cookies);
    // TMDB añade `denied=true` si el usuario pulsa «Denegar».
    if (!requestToken || url.searchParams.get('denied') === 'true') return redirect('/perfil/importar?tmdb=denied');
    try {
        setAccess(cookies, await createAccessToken(requestToken));
        return redirect('/perfil/importar?tmdb=ok');
    } catch (err) {
        console.error('[api/import/tmdb/callback] error:', (err as Error).message);
        return redirect('/perfil/importar?tmdb=denied');
    }
};
