/**
 * /api/lists/counts — contadores de las listas fijas + colecciones (Tab bar móvil).
 *
 * GET → { ok, counts: { favoritos, megusta, vistos, pendientes, verpronto, siguiendo, colecciones } }
 *
 * Lo consume la hoja "Mis listas" del tab bar móvil, en LAZY (fetch al abrir),
 * para no añadir consultas en el SSR de cada página. Reutiliza
 * `getLibrarySnapshot()` (cacheado por uid) → coste casi nulo en caliente.
 * Invitado → 401. El uid sale SIEMPRE de la sesión (locals.user).
 */
import type { APIRoute } from 'astro';
import { getLibrarySnapshot } from '../../../services/BD/shared/librarySnapshot';
import { getCustomLists } from '../../../services/BD/lists/customLists';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const [snap, lists] = await Promise.all([getLibrarySnapshot(), getCustomLists()]);
        const counts = {
            favoritos:  snap.movFavs.length + snap.tvFavs.length,
            megusta:    snap.movLike.length + snap.tvLike.length,
            vistos:     snap.movVistos.length + snap.tvVistos.length,
            pendientes: snap.movPend.length + snap.tvPend.length,
            verpronto:  snap.movVerPronto.length + snap.tvVerPronto.length,
            siguiendo:  snap.tvSig.length,
            colecciones: lists.length,
        };
        return json({ ok: true, counts });
    } catch (err) {
        console.error('[api/lists/counts GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudieron contar las listas.' }, 500);
    }
};
