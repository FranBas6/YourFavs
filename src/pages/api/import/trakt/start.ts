/**
 * GET /api/import/trakt/start — «Conectar con Trakt» (lote F2): genera el verificador PKCE, lo guarda
 * en una cookie y manda al usuario a trakt.tv a aprobar el permiso; Trakt vuelve a `/callback`.
 */
import type { APIRoute } from 'astro';
import { authorizeUrl, newPkce, traktEnabled } from '../../../../services/API/shared/traktAccount';
import { setPkce } from './_session';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, locals, redirect }) => {
    if (!locals.user) return redirect('/');
    if (!traktEnabled()) return redirect('/perfil/importar');
    const { verifier, challenge, state } = newPkce();
    setPkce(cookies, { verifier, state });
    return redirect(authorizeUrl(`${url.origin}/api/import/trakt/callback`, state, challenge));
};
