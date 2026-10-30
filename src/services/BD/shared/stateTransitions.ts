/**
 * Modelo de estados de 2 capas (handoff design_handoff_estados).
 *
 * Capa PROGRESO (excluyentes, o ninguno): Pendiente · Ver pronto (subconjunto de
 * Pendiente) · Viendo (solo pelis) · Visto. La capa OPINIÓN (Favorito · Me gusta ·
 * nota) va ENCIMA de Visto: marcar opinión IMPLICA visto.
 *
 * Al AÑADIR a una lista, este mapa dice qué colecciones se limpian (`remove`), qué
 * colecciones se añaden en cascada (`alsoAdd`, p.ej. Visto al favear) y si el
 * marcado registra un "pase" en el diario (`logPase`). Reglas:
 *   - Marcar CONSUMIDO (Visto/Fav/Like) limpia el progreso (Pendiente/Ver pronto/
 *     Viendo — en series, Siguiendo hace de "Viendo").
 *   - La opinión es de un solo nivel: Favorito y Me gusta se excluyen mutuamente.
 *   - Fav/Like añaden Visto (paraguas "consumido").
 *   - Marcar PROGRESO (Pendiente/Ver pronto/Viendo/Siguiendo) NO borra opinión ni
 *     Visto (re-ver es libre). "Ver pronto" convive con "Pendiente".
 *
 * El QUITAR (remove) nunca cascada: es un borrado simple (no auto-restaurar).
 */
export interface Transition {
    /** Colecciones a borrar (solo si el doc existe) al añadir a la colección clave. */
    remove: string[];
    /** Colecciones a añadir en cascada (solo si no existen ya). */
    alsoAdd: string[];
    /** Si añadir a esta colección registra un pase en WatchLog. */
    logPase: boolean;
}

// NB: 'MoviesViendo' aún no está en MOVIE_COLLECTIONS (llega en el Bloque 2). Aparece
// aquí en los `remove` para que, en cuanto exista, la limpieza funcione sin tocar este
// mapa; hoy es un no-op (solo se borran colecciones cargadas que existen).
const MOVIE: Record<string, Transition> = {
    MoviesPendientes: { remove: [], alsoAdd: [], logPase: false },
    MoviesVerPronto: { remove: [], alsoAdd: [], logPase: false },
    MoviesViendo: { remove: ['MoviesPendientes', 'MoviesVerPronto'], alsoAdd: [], logPase: false },
    MoviesVistas: { remove: ['MoviesPendientes', 'MoviesVerPronto', 'MoviesViendo'], alsoAdd: [], logPase: true },
    MovieFavs: { remove: ['MoviesPendientes', 'MoviesVerPronto', 'MoviesViendo', 'LikedMovies'], alsoAdd: ['MoviesVistas'], logPase: true },
    LikedMovies: { remove: ['MoviesPendientes', 'MoviesVerPronto', 'MoviesViendo', 'MovieFavs'], alsoAdd: ['MoviesVistas'], logPase: true },
};

// En series, "Siguiendo" es el estado de progreso (equivalente al "Viendo" de pelis).
// El primer visionado de una serie es derivado (base 1 si está en Vistas) + pases
// explícitos, así que marcar Vista/Fav/Like NO registra pase (logPase:false) para no
// romper el "N veces".
const SERIE: Record<string, Transition> = {
    SeriesPendiente: { remove: [], alsoAdd: [], logPase: false },
    SeriesVerPronto: { remove: [], alsoAdd: [], logPase: false },
    SeriesSiguiendo: { remove: ['SeriesPendiente', 'SeriesVerPronto', 'SeriesAbandonadas'], alsoAdd: [], logPase: false },
    SeriesVistas: { remove: ['SeriesPendiente', 'SeriesVerPronto', 'SeriesSiguiendo', 'SeriesAbandonadas'], alsoAdd: [], logPase: false },
    SeriesFavs: { remove: ['SeriesPendiente', 'SeriesVerPronto', 'SeriesSiguiendo', 'SeriesAbandonadas', 'LikedSeries'], alsoAdd: ['SeriesVistas'], logPase: false },
    LikedSeries: { remove: ['SeriesPendiente', 'SeriesVerPronto', 'SeriesSiguiendo', 'SeriesAbandonadas', 'SeriesFavs'], alsoAdd: ['SeriesVistas'], logPase: false },
    // "Abandonada" (§1 rescate): sale del progreso ACTIVO (Siguiendo/Pendiente/Ver pronto),
    // pero CONSERVA el progreso de episodios (WatchedEpisodes, no es colección de este mapa) y
    // la opinión (Favs/Like/nota, que NO están en su `remove`). Reanudar = marcar Siguiendo, que
    // la quita de aquí. Marcarla Vista/Fav/Like también la des-abandona.
    SeriesAbandonadas: { remove: ['SeriesSiguiendo', 'SeriesPendiente', 'SeriesVerPronto'], alsoAdd: [], logPase: false },
};

const EMPTY: Transition = { remove: [], alsoAdd: [], logPase: false };

export function getTransition(mediaType: 'movie' | 'serie', collection: string): Transition {
    return (mediaType === 'movie' ? MOVIE : SERIE)[collection] ?? EMPTY;
}
