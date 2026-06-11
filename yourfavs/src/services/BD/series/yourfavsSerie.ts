import { FieldValue } from "firebase-admin/firestore";
import { userCol, userDoc, getCurrentUid } from "../shared/userScope";
import { appendWatchLog, appendEpisodes } from "../lists/watchLog";
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

const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto'];

const ACTION_TYPE_MAP: Record<string, string> = {
    'favs': 'SeriesFavs',
    'pendientes': 'SeriesPendiente',
    'vistas': 'SeriesVistas',
    'siguiendo': 'SeriesSiguiendo',
    'liked': 'LikedSeries',
    'verpronto': 'SeriesVerPronto',
};

export async function handleSerieFavAction(formData: FormData): Promise<string> {
    const serieId = String(formData.get('id') || formData.get('serie_id'));
    const action = String(formData.get('action'));
    const actionType = String(formData.get('actionType'));

    // Guardar opinión en todas las colecciones
    if (action === 'save_opinion' || actionType === 'opinion') {
        const opinionText = String(formData.get('opinion') || '').trim();
        const refs = SERIE_COLLECTIONS.map(col => userDoc(col, serieId));
        const snaps = await Promise.all(refs.map(ref => ref.get()));
        await Promise.all(
            snaps
                .filter(snap => snap.exists)
                .map(snap => snap.ref.update({ opinion: opinionText }))
        );
        return `/serie/${serieId}`;
    }

    // Guardar rating 1-10 en todas las colecciones
    if (action === 'save_rating' || actionType === 'rating') {
        const ratingNum = Math.max(1, Math.min(10, Number(formData.get('rating') || 0)));
        if (!ratingNum) return `/serie/${serieId}`;
        const refs = SERIE_COLLECTIONS.map(col => userDoc(col, serieId));
        const snaps = await Promise.all(refs.map(ref => ref.get()));
        await Promise.all(
            snaps
                .filter(snap => snap.exists)
                .map(snap => snap.ref.update({ rating: ratingNum }))
        );
        return `/serie/${serieId}`;
    }

    // Eliminar rating
    if (action === 'delete_rating') {
        const refs = SERIE_COLLECTIONS.map(col => userDoc(col, serieId));
        const snaps = await Promise.all(refs.map(ref => ref.get()));
        await Promise.all(
            snaps
                .filter(snap => snap.exists)
                .map(snap => snap.ref.update({ rating: FieldValue.delete() }))
        );
        return `/serie/${serieId}`;
    }

    // Eliminar opinión
    if (action === 'delete_opinion') {
        const refs = SERIE_COLLECTIONS.map(col => userDoc(col, serieId));
        const snaps = await Promise.all(refs.map(ref => ref.get()));
        await Promise.all(
            snaps
                .filter(snap => snap.exists)
                .map(snap => snap.ref.update({ opinion: FieldValue.delete() }))
        );
        return `/serie/${serieId}`;
    }

    // Determinar colección
    const coleccion = ACTION_TYPE_MAP[actionType];
    if (!coleccion) throw new Error(`Tipo de acción no válido: ${actionType}`);

    const docRef = userDoc(coleccion, serieId);
    const docSnap = await docRef.get();
    const serieExiste = docSnap.exists;
    const customPosition = formData.get('custom_position') ? Number(formData.get('custom_position')) : null;

    if (action === 'add' && !serieExiste) {
        const baseEntry: Record<string, any> = {
            id: serieId,
            added_at: new Date(),
        };

        // Buscar opinión existente (lectura paralela)
        const opinionSnaps = await Promise.all(
            SERIE_COLLECTIONS.map(col => userDoc(col, serieId).get())
        );
        const foundOpinion = opinionSnaps.find(s => s.exists && s.data()?.opinion);
        const existingOpinion: string = foundOpinion?.data()?.opinion || '';

        const opinionForSeries = String(formData.get('opinion') || '').trim() || existingOpinion;
        const newEntry = opinionForSeries ? { ...baseEntry, opinion: opinionForSeries } : baseEntry;

        // Manejo de posición para favoritos
        if (coleccion === 'SeriesFavs') {
            const favsSnapshot = await userCol('SeriesFavs').orderBy('position').get();
            const currentFavorites: SeriesFavs[] = [];
            favsSnapshot.forEach((d) => {
                currentFavorites.push({id: d.id, ...d.data()} as SeriesFavs);
            });

            let newPosition: number;
            if (customPosition !== null) {
                const seriesToUpdate = currentFavorites.filter(fav => fav.position >= customPosition);
                for (const fav of seriesToUpdate.sort((a, b) => b.position - a.position)) {
                    await userDoc('SeriesFavs', fav.id).update({ position: fav.position + 1 });
                }
                newPosition = customPosition;
            } else {
                newPosition = currentFavorites.length > 0
                    ? Math.max(...currentFavorites.map(f => f.position || 0)) + 1
                    : 1;
            }
            newEntry.position = newPosition;
        }

        await docRef.set(newEntry);

    } else if (action === 'remove' && serieExiste) {
        await docRef.delete();

        if (coleccion === 'SeriesFavs') {
            const favsSnapshot = await userCol('SeriesFavs').orderBy('position').get();
            const remainingFavorites: SeriesFavs[] = [];
            favsSnapshot.forEach((d) => {
                remainingFavorites.push({id: d.id, ...d.data()} as SeriesFavs);
            });
            for (let i = 0; i < remainingFavorites.length; i++) {
                await userDoc('SeriesFavs', remainingFavorites[i].id).update({ position: i + 1 });
            }
        }

    } else if (action === 'update' && serieExiste && coleccion === 'SeriesFavs') {
        const requestedPosition = customPosition !== null ? customPosition : Number(formData.get('custom_position'));
        if (!requestedPosition || Number.isNaN(requestedPosition)) throw new Error('Nueva posición inválida');

        const favsSnapshot = await userCol('SeriesFavs').orderBy('position').get();
        const favorites: SeriesFavs[] = [];
        favsSnapshot.forEach((d) => {
            favorites.push({id: d.id, ...d.data()} as SeriesFavs);
        });

        if (favorites.length === 0) return `/serie/${serieId}`;

        const currentFav = favorites.find(f => f.id === serieId);
        const oldPos = currentFav?.position ?? null;
        if (oldPos === null) throw new Error('La serie no tiene posición actual definida');

        const maxPos = favorites.length;
        const newPos = Math.min(Math.max(1, requestedPosition), maxPos);

        if (newPos !== oldPos) {
            if (newPos > oldPos) {
                for (const fav of favorites.filter(f => (f.position || 0) > oldPos && (f.position || 0) <= newPos)) {
                    await userDoc('SeriesFavs', fav.id).update({ position: (fav.position || 0) - 1 });
                }
            } else {
                for (const fav of favorites.filter(f => (f.position || 0) >= newPos && (f.position || 0) < oldPos)) {
                    await userDoc('SeriesFavs', fav.id).update({ position: (fav.position || 0) + 1 });
                }
            }
            await docRef.update({ position: newPos });
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
    }

    return `/serie/${serieId}`;
}

// Helper para obtener documentos de una colección ordenados por fecha
async function getSeriesCollection<T>(collectionName: string, orderField: string = "added_at", orderDirection: "asc" | "desc" = "desc"): Promise<T[]> {
    if (!getCurrentUid()) return [];
    try {
        const querySnapshot = await userCol(collectionName).orderBy(orderField, orderDirection).get();

        if (querySnapshot.empty) return [];

        return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
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
            await Promise.all(
                seriesWithOrder.map((series, index) =>
                    userDoc("SeriesFavs", series.id).update({ position: index })
                )
            );
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

export async function clearAllSeriesVerPronto(): Promise<void> {
    const querySnapshot = await userCol('SeriesVerPronto').get();

    const deletePromises: Promise<unknown>[] = [];
    querySnapshot.forEach((docSnapshot) => {
        deletePromises.push(userDoc('SeriesVerPronto', docSnapshot.id).delete());
    });

    await Promise.all(deletePromises);
}

export async function deleteSerieVerProntoById(serieId: string): Promise<void> {
    await userDoc('SeriesVerPronto', serieId).delete();
}

import { processBatch } from '../../../utils/processBatch';
import { tmdbFetchList } from '../../API/shared/tmdbClient';

export const getRecommendedSeries = async (limit: number = 20): Promise<RecommendedSeries[]> => {
    try {
        // Obtener todas las listas (incluyendo vistas y pendientes para exclusión completa)
        const [favoritas, siguiendo, gustadas, vistas, pendientes, verPronto] = await Promise.all([
            getSerieFav(),
            getSeriesSiguiendo(),
            getLikedSeries(),
            getSeriesVistas(),
            getSeriesPendientes(),
            getSeriesVerPronto(),
        ]);

        // IDs a excluir de las recomendaciones (todas las colecciones)
        const excludeIds = new Set<string>();
        [...favoritas, ...siguiendo, ...gustadas, ...vistas, ...pendientes, ...verPronto]
            .forEach(serie => excludeIds.add(serie.id));

        if (favoritas.length === 0 && siguiendo.length === 0 && gustadas.length === 0) {
            return [];
        }

        // Construir lista de series a consultar con sus pesos, deduplicando por ID
        const processedIds = new Set<string>();
        const seriesToFetch: { id: string; weight: number }[] = [];

        for (const serie of favoritas) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 2.0 });
            }
        }
        for (const serie of siguiendo) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 1.75 });
            }
        }
        for (const serie of gustadas) {
            if (!processedIds.has(serie.id)) {
                processedIds.add(serie.id);
                seriesToFetch.push({ id: serie.id, weight: 1.5 });
            }
        }

        // Obtener recomendaciones en lotes de 5 para respetar rate limits de TMDB
        const allRecommendationsArrays = await processBatch(
            seriesToFetch,
            (item) => fetchRecommendationsForSeries(item.id, item.weight),
            5
        );

        const allRecommendations = allRecommendationsArrays.flat();

        // Filtrar, deduplicar, ordenar y limitar
        const filteredRecommendations = allRecommendations.filter(rec =>
            !excludeIds.has(rec.id)
        );

        const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);
        uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));

        return uniqueRecommendations.slice(0, limit);
    } catch (error) {
        console.error("Error al obtener series recomendadas:", error);
        return [];
    }
};

const fetchRecommendationsForSeries = async (seriesId: string, weight: number = 1.0): Promise<RecommendedSeries[]> => {
    try {
        const { tmdbFetch } = await import('../../API/shared/tmdbClient');

        const [sourceDetail, results] = await Promise.all([
            tmdbFetch<any>(`/tv/${seriesId}`).catch(() => null),
            tmdbFetchList<any>(`/tv/${seriesId}/recommendations`),
        ]);

        const sourceTitle = sourceDetail?.name || '';

        return results.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            poster_path: item.poster_path,
            vote_average: item.vote_average,
            overview: item.overview,
            first_air_date: item.first_air_date,
            popularity: item.popularity,
            score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight,
            sourceTitle,
        }));
    } catch (error) {
        console.error(`Error al obtener recomendaciones para serie ${seriesId}:`, error);
        return [];
    }
};

const removeDuplicatesAndCalculateScores = (recommendations: RecommendedSeries[]): RecommendedSeries[] => {
    const uniqueMap = new Map<string, RecommendedSeries>();

    for (const rec of recommendations) {
        const existing = uniqueMap.get(rec.id);
        if (existing) {
            uniqueMap.set(rec.id, { ...existing, score: (existing.score || 0) + (rec.score || 0) });
        } else {
            uniqueMap.set(rec.id, rec);
        }
    }

    return Array.from(uniqueMap.values());
};

// === Watched Episodes ===

export async function getWatchedProgress(serieId: string): Promise<WatchedProgress | null> {
    if (!getCurrentUid()) return null;
    try {
        const snap = await userDoc('WatchedEpisodes', serieId).get();
        if (!snap.exists) return null;
        return snap.data() as WatchedProgress;
    } catch (error) {
        console.error('Error al obtener progreso:', error);
        return null;
    }
}

export async function toggleWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const ref = userDoc('WatchedEpisodes', serieId);
    const snap = await ref.get();

    if (!snap.exists) {
        // Primer episodio marcado — crear documento
        const ep: WatchedEpisode = { season, episode, watched_at: new Date().toISOString() };
        await ref.set({
            id: serieId,
            watched_episodes: [ep],
            last_watched: ep,
        });
        await logEpisode(serieId, season, episode);
        return;
    }

    const data = snap.data() as WatchedProgress;
    const episodes = data.watched_episodes || [];
    const idx = episodes.findIndex(e => e.season === season && e.episode === episode);

    if (idx >= 0) {
        // Ya visto — quitar (no toca el diario: es append-only)
        episodes.splice(idx, 1);
        await ref.update({
            watched_episodes: episodes,
            last_watched: episodes.length > 0 ? episodes[episodes.length - 1] : null,
        });
    } else {
        // No visto — añadir
        const ep: WatchedEpisode = { season, episode, watched_at: new Date().toISOString() };
        episodes.push(ep);
        await ref.update({
            watched_episodes: episodes,
            last_watched: ep,
        });
        await logEpisode(serieId, season, episode);
    }
}

/**
 * Marca un episodio como visto de forma IDEMPOTENTE (si ya está, no hace nada).
 * Para acciones tipo "✓ Marcar visto" fuera de la ficha: un doble click sobre
 * toggleWatchedEpisode lo desmarcaría.
 */
export async function markWatchedEpisode(serieId: string, season: number, episode: number): Promise<void> {
    const ref = userDoc('WatchedEpisodes', serieId);
    const snap = await ref.get();
    const ep: WatchedEpisode = { season, episode, watched_at: new Date().toISOString() };

    if (!snap.exists) {
        await ref.set({ id: serieId, watched_episodes: [ep], last_watched: ep });
        await logEpisode(serieId, season, episode);
        return;
    }

    const data = snap.data() as WatchedProgress;
    const episodes = data.watched_episodes || [];
    if (episodes.some(e => e.season === season && e.episode === episode)) return; // ya visto

    episodes.push(ep);
    await ref.update({ watched_episodes: episodes, last_watched: ep });
    await logEpisode(serieId, season, episode);
}

export async function markSeasonWatched(serieId: string, season: number, episodeNumbers: number[]): Promise<void> {
    const ref = userDoc('WatchedEpisodes', serieId);
    const snap = await ref.get();
    const now = new Date().toISOString();

    const newEpisodes: WatchedEpisode[] = episodeNumbers.map(ep => ({ season, episode: ep, watched_at: now }));

    if (!snap.exists) {
        const last = newEpisodes[newEpisodes.length - 1];
        await ref.set({ id: serieId, watched_episodes: newEpisodes, last_watched: last });
        await logSeasonEpisodes(serieId, episodeNumbers.map(ep => ({ season, episode: ep })));
        return;
    }

    const data = snap.data() as WatchedProgress;
    // Quitar episodios de esta temporada que ya estén y reemplazar con todos
    const otherEpisodes = (data.watched_episodes || []).filter(e => e.season !== season);
    const allEpisodes = [...otherEpisodes, ...newEpisodes];
    await ref.update({
        watched_episodes: allEpisodes,
        last_watched: allEpisodes[allEpisodes.length - 1],
    });
    await logSeasonEpisodes(serieId, episodeNumbers.map(ep => ({ season, episode: ep })));
}

export async function unmarkSeasonWatched(serieId: string, season: number): Promise<void> {
    const ref = userDoc('WatchedEpisodes', serieId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const data = snap.data() as WatchedProgress;
    const remaining = (data.watched_episodes || []).filter(e => e.season !== season);
    await ref.update({
        watched_episodes: remaining,
        last_watched: remaining.length > 0 ? remaining[remaining.length - 1] : null,
    });
}

export async function markAllWatched(serieId: string, allEpisodes: { season: number; episode: number }[]): Promise<void> {
    const ref = userDoc('WatchedEpisodes', serieId);
    const now = new Date().toISOString();
    const episodes: WatchedEpisode[] = allEpisodes.map(e => ({ season: e.season, episode: e.episode, watched_at: now }));
    const last = episodes[episodes.length - 1];
    await ref.set({ id: serieId, watched_episodes: episodes, last_watched: last });
    await logSeasonEpisodes(serieId, allEpisodes.map(e => ({ season: e.season, episode: e.episode })));
}

export async function unmarkAllWatched(serieId: string): Promise<void> {
    await userDoc('WatchedEpisodes', serieId).delete();
}

export async function getWatchedProgressBatch(serieIds: string[]): Promise<Record<string, { watched: number; total?: number; bySeasons?: Record<number, number>; lastWatchedAt?: number }>> {
    if (serieIds.length === 0) return {};
    const results = await Promise.all(
        serieIds.map(id => getWatchedProgress(id))
    );
    const map: Record<string, { watched: number; bySeasons?: Record<number, number>; lastWatchedAt?: number }> = {};
    for (let i = 0; i < serieIds.length; i++) {
        const data = results[i];
        if (data && data.watched_episodes.length > 0) {
            const bySeasons: Record<number, number> = {};
            let lastWatchedAt = 0;
            for (const ep of data.watched_episodes) {
                if (ep.season > 0) bySeasons[ep.season] = (bySeasons[ep.season] || 0) + 1;
                if (ep.watched_at) {
                    const t = new Date(ep.watched_at).getTime();
                    if (!isNaN(t) && t > lastWatchedAt) lastWatchedAt = t;
                }
            }
            map[serieIds[i]] = {
                watched: data.watched_episodes.length,
                bySeasons,
                ...(lastWatchedAt > 0 ? { lastWatchedAt } : {}),
            };
        }
    }
    return map;
}

/**
 * Calcula la racha actual de días consecutivos viendo episodios.
 * Usa la zona horaria local. Cuenta hoy o ayer como inicio (para no romper la racha
 * antes de la medianoche). Si el día más reciente es anterior a ayer, la racha es 0.
 */
export async function getWatchStreak(): Promise<{ current: number; lastDay: string | null }> {
    if (!getCurrentUid()) return { current: 0, lastDay: null };
    try {
        const snap = await userCol('WatchedEpisodes').get();
        // Día absoluto en hora de Madrid (no UTC del servidor): así una marca de
        // las 00:30 cuenta en su día real y la racha no se rompe de madrugada.
        const dayNums = new Set<number>();
        for (const docSnap of snap.docs) {
            const data = docSnap.data() as { watched_episodes?: { watched_at?: string }[] };
            for (const ep of data.watched_episodes || []) {
                if (!ep.watched_at) continue;
                const t = new Date(ep.watched_at).getTime();
                if (isNaN(t)) continue;
                dayNums.add(appDateParts(t).dayNum);
            }
        }
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
 * Racha máxima histórica + actual, en una sola lectura de WatchedEpisodes.
 * Cada día se reduce a un nº de día absoluto en hora de Madrid (appDateParts,
 * DST-safe) y se busca la secuencia consecutiva más larga. La actual replica el
 * criterio de getWatchStreak (hoy o ayer cuentan).
 */
export async function getMaxWatchStreak(): Promise<{ max: number; current: number }> {
    if (!getCurrentUid()) return { max: 0, current: 0 };
    try {
        const snap = await userCol("WatchedEpisodes").get();
        const dayNums = new Set<number>();
        for (const docSnap of snap.docs) {
            const data = docSnap.data() as { watched_episodes?: { watched_at?: string }[] };
            for (const ep of data.watched_episodes || []) {
                if (!ep.watched_at) continue;
                const d = new Date(ep.watched_at);
                if (isNaN(d.getTime())) continue;
                dayNums.add(appDateParts(d.getTime()).dayNum);
            }
        }
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

export interface SerieYearActivity {
    id: string;
    lastWatchedAt: number;
    firstWatchedAtInYear: number;
    episodesInYear: number;
    totalWatched: number;
}

/**
 * Lee todos los WatchedEpisodes y devuelve las series con actividad en el año dado.
 * Una serie entra si tiene al menos 1 episodio cuyo watched_at cae en [year, year+1).
 * lastWatchedAt y firstWatchedAtInYear corresponden a episodios DEL año, no overall.
 * Una sola lectura de colección (snapshot completo) — no se puede filtrar por server-side
 * con Firestore porque watched_at vive dentro de un array, no en un campo top-level.
 */
export async function getSeriesActivityByYear(year: number): Promise<SerieYearActivity[]> {
    if (!getCurrentUid()) return [];
    try {
        const snap = await userCol('WatchedEpisodes').get();
        const yearStart = new Date(year, 0, 1).getTime();
        const yearEnd = new Date(year + 1, 0, 1).getTime();
        const out: SerieYearActivity[] = [];
        for (const docSnap of snap.docs) {
            const data = docSnap.data() as { watched_episodes?: WatchedEpisode[] };
            const eps = data.watched_episodes || [];
            let lastWatchedAt = 0;
            let firstWatchedAtInYear = 0;
            let episodesInYear = 0;
            for (const ep of eps) {
                if (!ep.watched_at) continue;
                const t = new Date(ep.watched_at).getTime();
                if (isNaN(t)) continue;
                if (t >= yearStart && t < yearEnd) {
                    episodesInYear++;
                    if (t > lastWatchedAt) lastWatchedAt = t;
                    if (firstWatchedAtInYear === 0 || t < firstWatchedAtInYear) firstWatchedAtInYear = t;
                }
            }
            if (episodesInYear > 0) {
                out.push({
                    id: docSnap.id,
                    lastWatchedAt,
                    firstWatchedAtInYear,
                    episodesInYear,
                    totalWatched: eps.length,
                });
            }
        }
        return out;
    } catch (error) {
        console.error('Error en getSeriesActivityByYear:', error);
        return [];
    }
}

// Re-export del client SDK db por compatibilidad con módulos que aún lo importan de aquí.
// (El acceso a datos por usuario va por Admin SDK + userScope; esto solo es compat.)
export { db } from "../../../utils/firebaseConfig";
