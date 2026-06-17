/**
 * Listas fijas (del sistema) accesibles desde el popover "Guardar en…" (Fase L4).
 *
 * Reutiliza los handlers existentes (handleMovieFavAction / handleSerieFavAction),
 * que ya guardan en users/{uid}/… vía userScope e invalidan cachés. Aquí solo
 * exponemos un acceso por (media_type, tmdb_id, list, action) para poder guardar
 * en Favoritos/Pendientes/Vistas desde cualquier card, no solo desde la ficha.
 *
 * Solo las 3 listas del mockup (favorites/pendientes/vistas); el resto (Me gusta,
 * Ver pronto, Siguiendo) siguen gestionándose en la ficha.
 */
import { userDoc, userCol, getCurrentUid } from '../shared/userScope';
import { handleMovieFavAction } from '../movies/yourfavsMovie';
import { handleSerieFavAction } from '../series/yourfavsSerie';

export type FixedList = 'favorites' | 'pendientes' | 'vistas';
export const FIXED_LISTS: FixedList[] = ['favorites', 'pendientes', 'vistas'];

// Colección Firestore por (media_type, lista). Las de series tienen otros nombres.
const COLLECTION_BY_MEDIA: Record<'movie' | 'tv', Record<FixedList, string>> = {
    movie: { favorites: 'MovieFavs', pendientes: 'MoviesPendientes', vistas: 'MoviesVistas' },
    tv: { favorites: 'SeriesFavs', pendientes: 'SeriesPendiente', vistas: 'SeriesVistas' },
};

// El handler de series usa `actionType` con nombres propios.
const SERIE_ACTION_TYPE: Record<FixedList, string> = {
    favorites: 'favs', pendientes: 'pendientes', vistas: 'vistas',
};

export function isFixedList(x: unknown): x is FixedList {
    return x === 'favorites' || x === 'pendientes' || x === 'vistas';
}

/** ¿En cuáles de las 3 listas fijas está ya este título? */
export async function getFixedMembership(
    mediaType: 'movie' | 'tv',
    tmdbId: number | string
): Promise<Record<FixedList, boolean>> {
    const result: Record<FixedList, boolean> = { favorites: false, pendientes: false, vistas: false };
    if (!getCurrentUid()) return result;
    const cols = COLLECTION_BY_MEDIA[mediaType];
    const snaps = await Promise.all(FIXED_LISTS.map(l => userDoc(cols[l], String(tmdbId)).get()));
    FIXED_LISTS.forEach((l, i) => { result[l] = snaps[i].exists; });
    return result;
}

/**
 * Añade/quita de una lista fija, reusando los handlers de la ficha. Devuelve el
 * tamaño de la lista TRAS la operación (`count`), para el toast "· #N" del popover.
 */
export async function saveFixed(
    mediaType: 'movie' | 'tv',
    tmdbId: number | string,
    list: FixedList,
    action: 'add' | 'remove'
): Promise<{ count: number }> {
    const fd = new FormData();
    fd.set('id', String(tmdbId));
    fd.set('action', action);
    if (mediaType === 'movie') {
        fd.set('list_type', list);
        await handleMovieFavAction(fd);
    } else {
        fd.set('actionType', SERIE_ACTION_TYPE[list]);
        await handleSerieFavAction(fd);
    }
    // Contador agregado (no lee los docs). Es decorativo: si falla, devolvemos 0.
    let count = 0;
    try {
        const agg = await userCol(COLLECTION_BY_MEDIA[mediaType][list]).count().get();
        count = agg.data().count;
    } catch { /* el toast simplemente no mostrará el #N */ }
    return { count };
}
