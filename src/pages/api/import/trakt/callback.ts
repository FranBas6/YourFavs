/**
 * GET /api/import/trakt/callback — vuelta desde trakt.tv (lote F2). Si el usuario aprobó, el `code` y el
 * verificador PKCE se cambian por un token de acceso (cookie httpOnly de 15 min) y se vuelve a
 * Ajustes → Importar, que empieza a leer sola. Si no aprobó (o el `state` no cuadra), vuelve con aviso.
 */
import type { APIRoute } from 'astro';
import { exchangeCode } from '../../../../services/API/shared/traktAccount';
import { setAccess, takePkce } from './_session';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, locals, redirect, url }) => {
    if (!locals.user) return redirect('/');
    const pkce = takePkce(cookies);
    const code = url.searchParams.get('code');
    // Trakt añade `error=access_denied` si el usuario pulsa «Denegar».
    if (!pkce || !code || url.searchParams.get('state') !== pkce.state) return redirect('/perfil/importar?trakt=denied');
    try {
        setAccess(cookies, await exchangeCode(code, pkce.verifier, `${url.origin}/api/import/trakt/callback`));
        return redirect('/perfil/importar?trakt=ok');
    } catch (err) {
        console.error('[api/import/trakt/callback] error:', (err as Error).message);
        return redirect('/perfil/importar?trakt=error');
    }
};
