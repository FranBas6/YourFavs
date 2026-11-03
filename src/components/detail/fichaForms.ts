/**
 * Contrato de los formularios de estado de las fichas (rediseño, Fase 4). La barra nueva envía
 * EXACTAMENTE lo mismo que la de antes, así que el POST de cada ficha, `handleMovieFavAction` /
 * `handleSerieFavAction` y `public/js/optimistic-actions.js` no cambian:
 *   - película: `list_type` = favorites | pendientes | vistas | verPronto | liked | viendo
 *   - serie:    `actionType` = favs | pendientes | vistas | verpronto | liked | siguiendo | abandonada
 */
export type FichaList = 'vista' | 'like' | 'fav' | 'pend' | 'pronto' | 'viendo' | 'seguir' | 'abandon';

const MOVIE: Partial<Record<FichaList, string>> = {
    vista: 'vistas', like: 'liked', fav: 'favorites', pend: 'pendientes', pronto: 'verPronto', viendo: 'viendo',
};
const TV: Partial<Record<FichaList, string>> = {
    vista: 'vistas', like: 'liked', fav: 'favs', pend: 'pendientes', pronto: 'verpronto', seguir: 'siguiendo', abandon: 'abandonada',
};

/** Nombre del campo y valor que espera el POST de la ficha para esa lista. */
export function fichaField(mediaType: 'movie' | 'tv', list: FichaList): { name: string; value: string } {
    const value = (mediaType === 'movie' ? MOVIE : TV)[list];
    if (!value) throw new Error(`Lista ${list} no válida para ${mediaType}`);
    return { name: mediaType === 'movie' ? 'list_type' : 'actionType', value };
}
