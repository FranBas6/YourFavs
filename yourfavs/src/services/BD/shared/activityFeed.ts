import { userCol, getCurrentUid } from "./userScope";
import { getFirebaseTimestamp } from "../../../utils/constants/helpers/media-helpers";
import { appDateParts } from "../../../utils/appTime";

export interface ActivityEvent {
    type: 'movie' | 'serie';
    id: string;
    collection: string;
    action: string;
    timestamp: number;
    episodes?: { season: number; episode: number }[];
}

const COLLECTIONS: { name: string; type: 'movie' | 'serie'; action: string }[] = [
    { name: 'MovieFavs', type: 'movie', action: 'Añadida a Favoritos' },
    { name: 'MoviesPendientes', type: 'movie', action: 'Marcada como pendiente' },
    { name: 'MoviesVistas', type: 'movie', action: 'Marcada como vista' },
    { name: 'MoviesVerPronto', type: 'movie', action: 'Añadida a Ver Pronto' },
    { name: 'LikedMovies', type: 'movie', action: 'Me gusta' },
    { name: 'SeriesFavs', type: 'serie', action: 'Añadida a Favoritos' },
    { name: 'SeriesPendiente', type: 'serie', action: 'Marcada como pendiente' },
    { name: 'SeriesVistas', type: 'serie', action: 'Marcada como vista' },
    { name: 'SeriesSiguiendo', type: 'serie', action: 'Empezaste a seguir' },
    { name: 'LikedSeries', type: 'serie', action: 'Me gusta' },
    { name: 'SeriesVerPronto', type: 'serie', action: 'Añadida a Ver Pronto' },
];

function dayKey(ts: number): string {
    return appDateParts(ts).key; // agrupado por día en hora de Madrid (no UTC del servidor)
}

async function fetchWatchedEpisodeEvents(): Promise<ActivityEvent[]> {
    try {
        const snap = await userCol('WatchedEpisodes').get();
        const events: ActivityEvent[] = [];
        for (const docSnap of snap.docs) {
            const data = docSnap.data() as { watched_episodes?: { season: number; episode: number; watched_at?: string }[] };
            const eps = data.watched_episodes || [];
            // Agrupar por día calendario
            const byDay = new Map<string, { ts: number; eps: { season: number; episode: number }[] }>();
            for (const ep of eps) {
                const ts = ep.watched_at ? new Date(ep.watched_at).getTime() : 0;
                if (!ts || isNaN(ts)) continue;
                const key = dayKey(ts);
                const bucket = byDay.get(key);
                if (bucket) {
                    bucket.eps.push({ season: ep.season, episode: ep.episode });
                    if (ts > bucket.ts) bucket.ts = ts;
                } else {
                    byDay.set(key, { ts, eps: [{ season: ep.season, episode: ep.episode }] });
                }
            }
            for (const { ts, eps: dayEps } of byDay.values()) {
                dayEps.sort((a, b) => a.season - b.season || a.episode - b.episode);
                const seasons = Array.from(new Set(dayEps.map(e => e.season))).sort((a, b) => a - b);
                const isContiguous = seasons.every((s, i) => i === 0 || s === seasons[i - 1] + 1);
                const seasonLabel = seasons.length === 1
                    ? `T${seasons[0]}`
                    : isContiguous
                        ? `T${seasons[0]}-T${seasons[seasons.length - 1]}`
                        : seasons.map(s => `T${s}`).join(', ');
                let action: string;
                if (dayEps.length === 1) {
                    action = `Episodio T${dayEps[0].season} E${dayEps[0].episode} visto`;
                } else if (seasons.length === 1 && dayEps.length <= 4) {
                    const list = dayEps.map(e => `E${e.episode}`).join(', ');
                    action = `${seasonLabel} ${list} vistos (${dayEps.length})`;
                } else {
                    action = `${dayEps.length} episodios vistos · ${seasonLabel}`;
                }
                events.push({
                    type: 'serie',
                    id: docSnap.id,
                    collection: 'WatchedEpisodes',
                    action,
                    timestamp: ts,
                    episodes: dayEps,
                });
            }
        }
        return events;
    } catch (error) {
        console.error('Error al leer WatchedEpisodes:', error);
        return [];
    }
}

// Re-visionados explícitos del botón "Vuelto a ver" (WatchLog): pelis con
// rewatch=true y "pases" de serie (entradas a nivel serie, sin season). NO los
// episodios sueltos (esos ya salen vía WatchedEpisodes; no duplicamos).
async function fetchRewatchEvents(): Promise<ActivityEvent[]> {
    try {
        const snap = await userCol('WatchLog').get();
        const events: ActivityEvent[] = [];
        for (const docSnap of snap.docs) {
            const x = docSnap.data() as { media_type?: string; tmdb_id?: number; season?: number; rewatch?: boolean; logged_at?: unknown; watched_on?: string };
            const isMovieRewatch = x.media_type === 'movie' && x.rewatch === true;
            const isSeriesPass = x.media_type === 'tv' && x.season == null;
            if (!isMovieRewatch && !isSeriesPass) continue;
            let ts = getFirebaseTimestamp(x.logged_at);
            if (!ts && x.watched_on) ts = new Date(x.watched_on + 'T12:00:00').getTime();
            if (!ts) continue;
            events.push({
                type: x.media_type === 'movie' ? 'movie' : 'serie',
                id: String(x.tmdb_id),
                collection: 'Rewatch',
                action: 'Vuelto a ver',
                timestamp: ts,
            });
        }
        return events;
    } catch (error) {
        console.error('Error al leer WatchLog (rewatch):', error);
        return [];
    }
}

export async function fetchAllActivityEvents(): Promise<ActivityEvent[]> {
    if (!getCurrentUid()) return [];
    const [collectionEvents, episodeEvents, rewatchEvents] = await Promise.all([
        Promise.all(
            COLLECTIONS.map(async (c) => {
                try {
                    const snap = await userCol(c.name).get();
                    return snap.docs
                        .map(d => ({
                            type: c.type,
                            id: d.id,
                            collection: c.name,
                            action: c.action,
                            timestamp: getFirebaseTimestamp(d.data().added_at),
                        }))
                        .filter(e => e.timestamp > 0);
                } catch (error) {
                    console.error(`Error al leer ${c.name}:`, error);
                    return [];
                }
            })
        ).then(r => r.flat()),
        fetchWatchedEpisodeEvents(),
        fetchRewatchEvents(),
    ]);
    return [...collectionEvents, ...episodeEvents, ...rewatchEvents];
}
