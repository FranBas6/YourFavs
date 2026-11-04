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

/** Cuántos de `base` no están en ninguna de `minus` (por id). */
function solo(base: any[], minus: any[][]): number {
    const ex = new Set(minus.flat().map((x) => String(x.id)));
    return base.filter((x) => !ex.has(String(x.id))).length;
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const [snap, lists] = await Promise.all([getLibrarySnapshot(), getCustomLists()]);
        const counts = {
            favoritos:  snap.movFavs.length + snap.tvFavs.length,
            megusta:    snap.movLike.length + snap.tvLike.length,
            // Como la página de Vistos (getMoviesVistasSolo / getSeriesVistasSolo): lo visto SIN
            // Me gusta ni Favorito — las listas van por niveles. Antes contaba todo (80 frente a 11).
            vistos:     solo(snap.movVistos, [snap.movLike, snap.movFavs]) + solo(snap.tvVistos, [snap.tvLike, snap.tvFavs]),
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
