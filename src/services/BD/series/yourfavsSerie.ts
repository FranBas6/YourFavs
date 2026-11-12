import { db, fetchAll, getAuthId, requireAuthId } from "../shared/userScope";
import {
    titleMembership, listCollection, addToCollections, removeFromCollections, clearCollection,
    patchTitle, setPosition, shiftPositions, renumberPositions,
} from "../shared/library";
import { getTransition } from "../shared/stateTransitions";
import { appendWatchLog, appendEpisodes, removeEpisodeFromLog } from "../lists/watchLog";
import { normalizeScore } from "../../../utils/constants/helpers/media-helpers";
import { appDateParts } from "../../../utils/appTime";
import type { SeriesFavs, SeriesInterface, RecommendedSeries, WatchedEpisode, WatchedProgress } from "../../../types/DbSerie";
export type { SeriesFavs, SeriesInterface, RecommendedSeries, WatchedEpisode, WatchedProgress };

// Diario (L5): registrar lo que se marca como visto, SIN acoplar al progreso y
// best-effort (un fallo del diario nunca rompe el marcado). Fecha = hoy.
async function logEpisode(serieId: string, season: number, episode: number): Promise<void> {
    try { await appendWatchLog({ media_type: 'tv', tmdb_id: serieId, season, episode }); } catch { /* diario opcional */ }
}
async function logSeasonEpisodes(serieId: string, eps: { season: number; episode: number }[]): Promise<void> {
    try { await appendEpisodes(serieId, eps); } catch { /* diario opcional */ }
}
// Desmarcar UN episodio = corregir un error → quitar también su última entrada del
// diario, para que no siga apareciendo en Actividad. Solo el toggle individual; los
// vaciados en bloque conservan el diario (son "volver a ver"). Best-effort.
async function unlogEpisode(serieId: string, season: number, episode: number): Promise<void> {
    try { await removeEpisodeFromLog(serieId, season, episode); } catch { /* diario opcional */ }
}
// Cualquier cambio de progreso cambia el resumen anual (episodios, heatmap, top series y
// el mes a mes). Antes solo lo invalidaban las mutaciones de LISTAS, así que marcar un
// episodio podía tardar hasta 1 h (el TTL) en verse en "Tu cine en números".
/** Vacía las cachés de «Para ti» (semillas y resultado) de este usuario. */
async function bustRecs(): Promise<void> {
    try {
        const [{ invalidateGenrePreferencesCache }, { invalidatePersonalRecsCache }] = await Promise.all([
            import('../../../utils/genrePreferences'), import('../../../utils/personalRecommendations'),
        ]);
        invalidateGenrePreferencesCache();
        invalidatePersonalRecsCache();
    } catch { /* la caché caduca sola */ }
}

async function bustYearStats(): Promise<void> {
    try {
        const { invalidateYearStatsCache } = await import('../../../utils/yearStats');
        invalidateYearStatsCache();
    } catch { /* la caché caduca sola */ }
}

const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto', 'SeriesAbandonadas'];

const ACTION_TYPE_MAP: Record<string, string> = {
    'favs': 'SeriesFavs',
    'pendientes': 'SeriesPendiente',
    'vistas': 'SeriesVistas',
    'siguiendo': 'SeriesSiguiendo',
    'liked': 'LikedSeries',
    'verpronto': 'SeriesVerPronto',
    'abandonada': 'SeriesAbandonadas',
};

export async function handleSerieFavAction(formData: FormData): Promise<string> {
    const serieId = String(formData.get('id') || formData.get('serie_id'));
    const action = String(formData.get('action'));
    const actionType = String(formData.get('actionType'));

    // Guardar opinión en todas las colecciones
    if (action === 'save_opinion' || actionType === 'opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        await patchTitle('tv', serieId, { opinion: opinionText });
        return `/serie/${serieId}`;
    }

    // Guardar rating 0,5-10 (medios puntos) en todas las colecciones
    if (action === 'save_rating' || actionType === 'rating') {
        const ratingNum = normalizeScore(formData.get('rating'));
        if (!ratingNum) return `/serie/${serieId}`;
        await patchTitle('tv', serieId, { rating: ratingNum });
        // 4.2 · almacén canónico de notas con timestamp → alimenta Actividad (best-effort).
        try {
            const { setRating } = await import('../lists/ratings');
            await setRating('tv', serieId, ratingNum);
        } catch { /* la nota inline ya está guardada */ }
        await bustRecs(); // una nota ≥ 8 siembra «Para ti»
        return `/serie/${serieId}`;
    }

    // Eliminar rating
    if (action === 'delete_rating') {
        await patchTitle('tv', serieId, { rating: null });
        try {
            const { deleteRating } = await import('../lists/ratings');
            await deleteRating('tv', serieId);
        } catch { /* ignore */ }
        await bustRecs();
        return `/serie/${serieId}`;
    }

    // Eliminar opinión
    if (action === 'delete_opinion') {
        await patchTitle('tv', serieId, { opinion: null });
        return `/serie/${serieId}`;
    }

    // Determinar colección
    const coleccion = ACTION_TYPE_MAP[actionType];
    if (!coleccion) throw new Error(`Tipo de acción no válido: ${actionType}`);

    // En qué listas está ya la serie: UNA consulta, reutilizada abajo.
    const membership = await titleMembership('tv', serieId);
    const serieExiste = membership.has(coleccion);
    const customPosition = formData.get('custom_position') ? Number(formData.get('custom_position')) : null;

    if (action === 'add' && !serieExiste) {
        // Buscar opinión + nota existentes (se copian al mover/añadir)
        let existingOpinion = '';
        let existingRating: number | undefined;
        for (const col of SERIE_COLLECTIONS) {
            const row = membership.get(col);
            if (!row) continue;
            if (!existingOpinion && row.opinion) existingOpinion = row.opinion;
            if (existingRating === undefined && row.rating !== null) existingRating = Number(row.rating);
        }

        const opinionForSeries = String(formData.get('opinion') || '').trim() || existingOpinion;
        // Entrada "limpia" (sin position) para la cascada a SeriesVistas.
        const castedEntry: { opinion?: string; rating?: number } = {};
        if (opinionForSeries) castedEntry.opinion = opinionForSeries;
        if (existingRating !== undefined) castedEntry.rating = existingRating;
        const newEntry: { opinion?: string; rating?: number; position?: number } = { ...castedEntry };

        // Manejo de posición para favoritos
        if (coleccion === 'SeriesFavs') {
            const currentFavorites = await listCollection('SeriesFavs', 'position', 'asc');
            let newPosition: number;
            if (customPosition !== null) {
                // Hueco en la posición pedida: todas las de detrás bajan una (un UPDATE).
                await shiftPositions('SeriesFavs', customPosition, null, 1);
                newPosition = customPosition;
            } else {
                newPosition = currentFavorites.length > 0
                    ? Math.max(...currentFavorites.map(f => f.position || 0)) + 1
                    : 1;
            }
            newEntry.position = newPosition;
        }

        // Modelo de 2 capas: mover + limpiar. Vista/Fav/Me gusta añaden "Vistas" y limpian el
        // progreso (Pendiente/Ver pronto/Siguiendo); Fav/Me gusta se excluyen. La cascada a
        // Vistas usa la entrada sin position. Altas antes que bajas: si algo fallara a medias,
        // la serie queda en una lista de más, nunca en ninguna.
        const tr = getTransition('serie', coleccion);
        await addToCollections(serieId, [
            { collection: coleccion, ...newEntry },
            ...tr.alsoAdd.filter(c => !membership.has(c)).map(collection => ({ collection, ...castedEntry })),
        ]);
        await removeFromCollections(serieId, tr.remove.filter(c => membership.has(c)));

        // §5 · bitácora de acciones de estado intencionales (best-effort, no derivables):
        // abandonar una serie a medias, o retomar una que estaba abandonada. El alta
        // "normal" (empezar a seguir, marcar vista…) ya se deriva de added_at → no va aquí.
        try {
            const wasAbandoned = membership.has('SeriesAbandonadas');
            if (coleccion === 'SeriesAbandonadas') {
                const { appendActivity } = await import('../shared/activityLog');
                await appendActivity({ verb: 'abandon', media_type: 'tv', tmdb_id: serieId });
            } else if (coleccion === 'SeriesSiguiendo' && wasAbandoned) {
                const { appendActivity } = await import('../shared/activityLog');
                await appendActivity({ verb: 'resume', media_type: 'tv', tmdb_id: serieId });
            }
        } catch { /* bitácora opcional */ }

    } else if (action === 'remove' && serieExiste) {
        await removeFromCollections(serieId, [coleccion]);

        // §5 · bitácora (best-effort): quitar de una lista es intencional y NO derivable
        // (se pierde el added_at). Dejar de seguir tiene verbo propio; el resto, 'remove'.
        // Los borrados en CASCADA (al mover con 'add') NO pasan por aquí → no se registran.
        try {
            const { appendActivity } = await import('../shared/activityLog');
            await appendActivity({
                verb: coleccion === 'SeriesSiguiendo' ? 'unfollow' : 'remove',
                media_type: 'tv', tmdb_id: serieId, meta: { collection: coleccion },
            });
        } catch { /* bitácora opcional */ }

        if (coleccion === 'SeriesFavs') {
            await renumberPositions('SeriesFavs'); // cierra el hueco: 1..n en un UPDATE
        }

    } else if (action === 'update' && serieExiste && coleccion === 'SeriesFavs') {
        const requestedPosition = customPosition !== null ? customPosition : Number(formData.get('custom_position'));
        if (!requestedPosition || Number.isNaN(requestedPosition)) throw new Error('Nueva posición inválida');

        const favorites = await listCollection('SeriesFavs', 'position', 'asc');

        if (favorites.length === 0) return `/serie/${serieId}`;

        const currentFav = favorites.find(f => f.id === serieId);
        const oldPos = currentFav?.position ?? null;
        if (oldPos === null) throw new Error('La serie no tiene posición actual definida');

        const maxPos = favorites.length;
        const newPos = Math.min(Math.max(1, requestedPosition), maxPos);

        if (newPos !== oldPos) {
            if (newPos > oldPos) await shiftPositions('SeriesFavs', oldPos + 1, newPos, -1);
            else await shiftPositions('SeriesFavs', newPos, oldPos - 1, 1);
            await setPosition('SeriesFavs', serieId, newPos);
            // §5 · bitácora (best-effort): mover un favorito de sitio es intencional.
            try {
                const { appendActivity } = await import('../shared/activityLog');
                await appendActivity({ verb: 'reorder', media_type: 'tv', tmdb_id: serieId, meta: { from: oldPos, to: newPos } });
            } catch { /* bitácora opcional */ }
        }
    }

    if (action === 'add' || action === 'remove') {
        try {
            const { invalidateYearStatsCache } = await import('../../../utils/yearStats');
            invalidateYearStatsCache();
        } catch { /* ignore */ }
        try {
            const { invalidateGenrePreferencesCache } = await import('../../../utils/genrePreferences');
            invalidateGenrePreferencesCache();
        } catch { /* ignore */ }
        try {
            const { invalidatePersonalRecsCache } = await import('../../../utils/personalRecommendations');
            invalidatePersonalRecsCache();
        } catch { /* ignore */ }
        try {
            const { invalidateTopActorsCache } = await import('../../../utils/topActorsLibrary');
            invalidateTopActorsCache();
        } catch { /* ignore */ }
        try {
            const { invalidatePersonalIndexCache } = await import('../shared/personalIndex');
            invalidatePersonalIndexCache(); // 4.3 · buscador "lo mío"
        } catch { /* ignore */ }
        try {
            const { invalidateLibrarySnapshot } = await import('../shared/librarySnapshot');
            invalidateLibrarySnapshot(); // snapshot compartido de la biblioteca
        } catch { /* ignore */ }
        try {
            const { invalidateActivityFeed } = await import('../shared/activityFeed');
            invalidateActivityFeed(); // §5 · altas/bajas/abandono/reorden salen en el feed
        } catch { /* ignore */ }
    }

    return `/serie/${serieId}`;
}

// Helper para obtener documentos de una colección ordenados por fecha
async function getSeriesCollection<T>(collectionName: string, orderField: 'added_at' | 'position' = "added_at", orderDirection: "asc" | "desc" = "desc"): Promise<T[]> {
    try {
        return (await listCollection(collectionName, orderField, orderDirection)) as unknown as T[];
    } catch (error) {
        console.error(`Error al obtener ${collectionName}:`, error);
        return [];
    }
}

// getSerieFav tiene lógica especial: ordena por position e inicializa posiciones si no existen
export const getSerieFav = async (): Promise<SeriesFavs[]> => {
    try {
        const result = await getSeriesCollection<SeriesFavs>("SeriesFavs", "position", "asc");
        if (result.length === 0) return [];

        const seriesWithOrder: SeriesFavs[] = result.map((series, index) => ({
            ...series,
            custom_order: series.position ?? index,
        }));

        if (seriesWithOrder.every(series => series.position === null || series.position === undefined)) {
            await renumberPositions('SeriesFavs');
        }

        return seriesWithOrder;
    } catch (error) {
        console.error("Error al obtener las series favoritas:", error);
        return [];
    }
};

export const getSeriesPendientes = () => getSeriesCollection<SeriesInterface>("SeriesPendiente");
export const getSeriesVistas = () => getSeriesCollection<SeriesInterface>("SeriesVistas");
export const getSeriesSiguiendo = () => getSeriesCollection<SeriesInterface>("SeriesSiguiendo");
export const getLikedSeries = () => getSeriesCollection<SeriesInterface>("LikedSeries");
export const getSeriesVerPronto = () => getSeriesCollection<SeriesInterface>("SeriesVerPronto");
export const getSeriesAbandonadas = () => getSeriesCollection<SeriesInterface>("SeriesAbandonadas");

/**
 * Vistas "a secas": consumido SIN opinión más fuerte (excluye Favoritos y Me gusta).
 * Paraguas "Visto" del modelo de 2 capas → la página /mislistas/vistos las excluye.
 */
export const getSeriesVistasSolo = async (): Promise<SeriesInterface[]> => {
    const [vistas, liked, favs] = await Promise.all([getSeriesVistas(), getLikedSeries(), getSerieFav()]);
    const exclude = new Set<string>([...liked.map(s => s.id), ...favs.map(s => s.id)]);
    return vistas.filter(s => !exclude.has(s.id));
};

export async function clearAllSeriesVerPronto(): Promise<void> {
    await clearCollection('SeriesVerPronto');
}

export async function deleteSerieVerProntoById(serieId: string): Promise<void> {
    await removeFromCollections(serieId, ['SeriesVerPronto']);
}


// === Watched Episodes ===
//
// En Firestore era UN documento por serie con un array `watched_episodes` que crecía sin fin, y
// cada marcado leía y reescribía el array entero. Aquí es una fila por episodio en
// `watched_episodes` (clave: usuario, serie, temporada, episodio). Hacia fuera se devuelve la
// misma forma de siempre (`WatchedProgress`), con el array ordenado como se fue llenando
// (por `watched_at`), porque `last_watched` = el último del array.

interface EpisodeRow { serie_id: number; season: number; episode: number; watched_at: string | null }

function rowsToProgress(serieId: string, rows: EpisodeRow[]): WatchedProgress | null {
    if (!rows.length) return null;
    const watched_episodes: WatchedEpisode[] = rows.map(r => ({
        season: r.season,
        episode: r.episode,
        ...(r.watched_at ? { watched_at: r.watched_at } : {}),
    })) as WatchedEpisode[];
    return { id: serieId, watched_episodes, last_watched: watched_episodes[watched_episodes.length - 1] } as WatchedProgress;
}

/** Episodios de una o varias series, en el orden en que se marcaron. */
async function episodeRows(serieIds?: (string | number)[]): Promise<EpisodeRow[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const ids = serieIds?.map(Number).filter(Number.isInteger);
    if (ids && ids.length === 0) return [];
    return fetchAll<EpisodeRow>((from, to) => {
        let q = db().from('watched_episodes').select('serie_id, season, episode, watched_at').eq('user_id', userId);
        if (ids) q = q.in('serie_id', ids);
        return q.order('watched_at', { ascending: true, nullsFirst: true })
            .order('serie_id').order('season').order('episode')
            .range(from, to);
    });
}

async function insertEpisodes(serieId: string, eps: { season: number; episode: number }[], watchedAt: string): Promise<EpisodeRow[]> {
    if (!eps.length) return [];
    const userId = requireAuthId();
    const rows = eps.map(e => ({ user_id: userId, serie_id: Number(serieId), season: e.season, episode: e.episode, watched_at: watchedAt }));
    // ignoreDuplicates: un episodio ya marcado se queda como estaba; devuelve solo los nuevos.
    const { data, error } = await db().from('watched_episodes')
        .upsert(rows, { onConflict: 'user_id,serie_id,season,episode', ignoreDuplicates: true })
        .select('serie_id, season, episode, watched_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as EpisodeRow[];
}

async function deleteEpisodes(serieId: string, filter: { season?: number; episode?: number } = {}): Promise<void> {
    const userId = requireAuthId();
    let q = db().from('watched_episodes').delete().eq('user_id', userId).eq('serie_id', Number(serieId));
    if (filter.season !== undefined) q = q.eq('season', filter.season);
    if (filter.episode !== undefined) q = q.eq('episode', filter.episode);
    const { error } = await q;
    if (error) throw new Error(error.message);
}

export async function getWatchedProgress(serieId: string): Promise<WatchedProgress | null> {
    try {
        return rowsToProgress(serieId, await episodeRows([serieId]));
    } catch (error) {
        console.error('Error al obtener progreso:', error);
        return null;
    }
}

/** Progreso de TODAS las series del usuario (lo que antes era leer la colección WatchedEpisodes entera). */
export async function getAllWatchedProgress(): Promise<WatchedProgress[]> {
    const bySerie = new Map<number, EpisodeRow[]>();
    for (const r of await episodeRows()) {
        const list = bySerie.get(r.serie_id);
        if (list) list.push(r); else bySerie.set(r.serie_id, [r]);
    }
    return Array.from(bySerie, ([id, rows]) => rowsToProgress(String(id), rows)!);
}

export async function toggleWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const inserted = await insertEpisodes(serieId, [{ season, episode }], new Date().toISOString());
    if (inserted.length) {
        // No estaba visto — añadido
        await logEpisode(serieId, season, episode);
    } else {
        // Ya visto — quitar. Corrección de un error: también quitamos su última
        // entrada del diario, para que deje de aparecer en Actividad.
        await deleteEpisodes(serieId, { season, episode });
        await unlogEpisode(serieId, season, episode);
    }
    await bustYearStats();
}

/**
 * Marca un episodio como visto de forma IDEMPOTENTE (si ya está, no hace nada).
 * Para acciones tipo "✓ Marcar visto" fuera de la ficha: un doble click sobre
 * toggleWatchedEpisode lo desmarcaría.
 */
export async function markWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const inserted = await insertEpisodes(serieId, [{ season, episode }], new Date().toISOString());
    if (!inserted.length) return; // ya visto
    await logEpisode(serieId, season, episode);
    await bustYearStats();
}

/**
 * Desmarca un episodio de forma IDEMPOTENTE (si no estaba visto, no hace nada). Como el toggle:
 * quita también su última entrada del diario. Para la ficha de episodio (TMDB D4), que sabe en qué
 * estado está y no debe invertir lo que no toca con un doble clic.
 */
export async function unmarkWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const progress = await getWatchedProgress(serieId);
    if (!progress?.watched_episodes.some((w) => w.season === season && w.episode === episode)) return;
    await deleteEpisodes(serieId, { season, episode });
    await unlogEpisode(serieId, season, episode);
    await bustYearStats();
}

/**
 * Marca varios episodios de una temporada (los que falten; los ya vistos se quedan con su fecha).
 * «Tienes 2 anteriores sin ver · Marcarlos» de la ficha de episodio (TMDB D4).
 */
export async function markWatchedEpisodes(serieId: string, season: number, episodes: number[]): Promise<number> {
    if (!episodes.length) return 0;
    const inserted = await insertEpisodes(serieId, episodes.map((episode) => ({ season, episode })), new Date().toISOString());
    if (!inserted.length) return 0;
    await logSeasonEpisodes(serieId, inserted.map((r) => ({ season: r.season, episode: r.episode })));
    await bustYearStats();
    return inserted.length;
}

/**
 * Desmarca varios episodios de una temporada (ficha de temporada) y devuelve los que estaban, con su
 * fecha, para que «Deshacer» los pueda devolver tal cual (`restoreWatchedEpisodes`).
 *   · `unlog: false` («Desmarcar temporada»): como el vaciado en bloque del acordeón, el diario se queda.
 *   · `unlog: true` (deshacer un «Marcar» de hace un momento): era un error, así que también sale del
 *     diario, como al desmarcar uno suelto.
 */
export async function unmarkWatchedEpisodes(
    serieId: string, season: number, episodes: number[], opts: { unlog?: boolean } = {},
): Promise<{ episode: number; watched_at: string | null }[]> {
    if (!episodes.length) return [];
    const userId = requireAuthId();
    const { data, error } = await db().from('watched_episodes').delete()
        .eq('user_id', userId).eq('serie_id', Number(serieId)).eq('season', season).in('episode', episodes)
        .select('episode, watched_at');
    if (error) throw new Error(error.message);
    const removed = ((data ?? []) as { episode: number; watched_at: string | null }[]).sort((a, b) => a.episode - b.episode);
    if (opts.unlog) for (const r of removed) await unlogEpisode(serieId, season, r.episode);
    if (removed.length) await bustYearStats();
    return removed;
}

/**
 * Vuelve a marcar episodios con la fecha que tenían («Deshacer» de un desmarcado en la ficha de temporada).
 *   · Sin `relog` («Desmarcar temporada»): el diario no se tocó al desmarcar en bloque, así que tampoco ahora.
 *   · Con `relog` (desmarcar uno de la lista, que sí lo sacó del diario): vuelve al diario con su día.
 */
export async function restoreWatchedEpisodes(
    serieId: string, season: number, rows: { episode: number; watched_at: string | null }[], opts: { relog?: boolean } = {},
): Promise<number> {
    if (!rows.length) return 0;
    const userId = requireAuthId();
    const now = new Date().toISOString();
    const { data, error } = await db().from('watched_episodes')
        .upsert(rows.map((r) => ({ user_id: userId, serie_id: Number(serieId), season, episode: r.episode, watched_at: r.watched_at ?? now })),
            { onConflict: 'user_id,serie_id,season,episode', ignoreDuplicates: true })
        .select('episode');
    if (error) throw new Error(error.message);
    if (opts.relog) {
        const back = new Set(((data ?? []) as { episode: number }[]).map((r) => r.episode));
        for (const r of rows) {
            if (!back.has(r.episode)) continue;
            const watched_on = r.watched_at ? appDateParts(new Date(r.watched_at).getTime()).key : undefined;
            try { await appendWatchLog({ media_type: 'tv', tmdb_id: serieId, season, episode: r.episode, watched_on }); } catch { /* diario opcional */ }
        }
    }
    await bustYearStats();
    return (data ?? []).length;
}

export async function markSeasonWatched(serieId: string, season: number, episodeNumbers: number[]): Promise<void> {
    // Quitar los episodios de esta temporada que ya estén y reemplazar con todos (misma hora).
    await deleteEpisodes(serieId, { season });
    await insertEpisodes(serieId, episodeNumbers.map(ep => ({ season, episode: ep })), new Date().toISOString());
    await logSeasonEpisodes(serieId, episodeNumbers.map(ep => ({ season, episode: ep })));
    await bustYearStats();
}

export async function unmarkSeasonWatched(serieId: string, season: number): Promise<void> {
    await deleteEpisodes(serieId, { season });
    await bustYearStats();
}

export async function markAllWatched(serieId: string, allEpisodes: { season: number; episode: number }[]): Promise<void> {
    // Sustituye el progreso entero (como el `set` del documento en Firestore).
    await deleteEpisodes(serieId);
    await insertEpisodes(serieId, allEpisodes.map(e => ({ season: e.season, episode: e.episode })), new Date().toISOString());
    await logSeasonEpisodes(serieId, allEpisodes.map(e => ({ season: e.season, episode: e.episode })));
    await bustYearStats();
}

export async function unmarkAllWatched(serieId: string): Promise<void> {
    await deleteEpisodes(serieId);
    await bustYearStats();
}

export async function getWatchedProgressBatch(serieIds: string[]): Promise<Record<string, { watched: number; total?: number; bySeasons?: Record<number, number>; lastWatchedAt?: number }>> {
    if (serieIds.length === 0) return {};
    // Una consulta para todas (antes: una lectura por serie).
    const rows = await episodeRows(serieIds);
    const map: Record<string, { watched: number; bySeasons?: Record<number, number>; lastWatchedAt?: number }> = {};
    for (const r of rows) {
        const key = String(r.serie_id);
        const entry = map[key] ??= { watched: 0, bySeasons: {} };
        entry.watched++;
        if (r.season > 0) entry.bySeasons![r.season] = (entry.bySeasons![r.season] || 0) + 1;
        if (r.watched_at) {
            const t = new Date(r.watched_at).getTime();
            if (!isNaN(t) && t > (entry.lastWatchedAt ?? 0)) entry.lastWatchedAt = t;
        }
    }
    return map;
}

/** Días (nº absoluto, hora de Madrid) en los que marcaste algún episodio. */
async function watchedDayNums(): Promise<Set<number>> {
    const dayNums = new Set<number>();
    for (const r of await episodeRows()) {
        if (!r.watched_at) continue;
        const t = new Date(r.watched_at).getTime();
        if (!isNaN(t)) dayNums.add(appDateParts(t).dayNum);
    }
    return dayNums;
}

/**
 * Calcula la racha actual de días consecutivos viendo episodios.
 * Usa la zona horaria local. Cuenta hoy o ayer como inicio (para no romper la racha
 * antes de la medianoche). Si el día más reciente es anterior a ayer, la racha es 0.
 */
export async function getWatchStreak(): Promise<{ current: number; lastDay: string | null }> {
    if (!getAuthId()) return { current: 0, lastDay: null };
    try {
        // Día absoluto en hora de Madrid (no UTC del servidor): así una marca de
        // las 00:30 cuenta en su día real y la racha no se rompe de madrugada.
        const dayNums = await watchedDayNums();
        if (dayNums.size === 0) return { current: 0, lastDay: null };

        const todayNum = appDateParts(Date.now()).dayNum;
        // La racha cuenta si hubo actividad hoy o ayer (Madrid).
        let cursor: number;
        if (dayNums.has(todayNum)) cursor = todayNum;
        else if (dayNums.has(todayNum - 1)) cursor = todayNum - 1;
        else return { current: 0, lastDay: null };

        const lastDayNum = cursor;
        let streak = 0;
        while (dayNums.has(cursor)) { streak++; cursor--; }

        return { current: streak, lastDay: new Date(lastDayNum * 86400000).toISOString() };
    } catch (error) {
        console.error('Error al calcular racha:', error);
        return { current: 0, lastDay: null };
    }
}

/**
 * Racha máxima histórica + actual, en una sola lectura del progreso.
 * Cada día se reduce a un nº de día absoluto en hora de Madrid (appDateParts,
 * DST-safe) y se busca la secuencia consecutiva más larga. La actual replica el
 * criterio de getWatchStreak (hoy o ayer cuentan).
 */
export async function getMaxWatchStreak(): Promise<{ max: number; current: number }> {
    if (!getAuthId()) return { max: 0, current: 0 };
    try {
        const dayNums = await watchedDayNums();
        if (dayNums.size === 0) return { max: 0, current: 0 };

        const sorted = Array.from(dayNums).sort((a, b) => a - b);
        let max = 0;
        let run = 0;
        let prev = NaN;
        for (const n of sorted) {
            run = n === prev + 1 ? run + 1 : 1;
            if (run > max) max = run;
            prev = n;
        }

        const todayNum = appDateParts(Date.now()).dayNum;
        let cursor = dayNums.has(todayNum) ? todayNum : dayNums.has(todayNum - 1) ? todayNum - 1 : null;
        let current = 0;
        while (cursor !== null && dayNums.has(cursor)) { current++; cursor--; }

        return { max, current };
    } catch (error) {
        console.error('Error al calcular racha máxima:', error);
        return { max: 0, current: 0 };
    }
}

// `getSeriesActivityByYear` vivía aquí y alimentaba el "mes a mes" de Tu año. Retirada: leía
// `WatchedEpisodes` por segunda vez en la misma request (yearStats ya la lee) y colapsaba cada
// serie a un único instante anual —el de su último episodio—, así que una serie vista entre
// dos meses solo aparecía en el segundo. Ahora lo calcula `buildTimeline` en `yearStats.ts`,
// sobre la unión de progreso y diario, con un tramo por serie y mes.
