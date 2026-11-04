import { getLibrarySnapshot } from '../services/BD/shared/librarySnapshot';

/**
 * Títulos que has visto, como claves `movie_<id>` / `tv_<id>` («Visto» = Vistas ∪ Favoritos ∪ Me gusta,
 * igual que en el resto de la app). Del snapshot de la biblioteca, sin TMDB. Sin sesión → vacío.
 */
export async function seenKeySet(loggedIn: boolean): Promise<Set<string>> {
    if (!loggedIn) return new Set();
    try {
        const snap = await getLibrarySnapshot();
        return new Set([
            ...[...snap.movVistos, ...snap.movFavs, ...snap.movLike].map((m: any) => `movie_${m.id}`),
            ...[...snap.tvVistos, ...snap.tvFavs, ...snap.tvLike].map((s: any) => `tv_${s.id}`),
        ]);
    } catch { return new Set(); }
}
