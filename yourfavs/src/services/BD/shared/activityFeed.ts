import { userCol, getCurrentUid } from "./userScope";
import { getLibrarySnapshot, type LibrarySnapshot } from "./librarySnapshot";
import { getFirebaseTimestamp } from "../../../utils/constants/helpers/media-helpers";
import { appDateParts } from "../../../utils/appTime";

export interface ActivityEvent {
    type: 'movie' | 'serie' | 'person';
    id: string;
    collection: string;
    action: string;
    timestamp: number;
    episodes?: { season: number; episode: number }[];
    /** Solo eventos de persona: llevan su nombre/foto (no se resuelven por TMDB). */
    name?: string;
    profile_path?: string | null;
    /** Nota opcional del visionado ("¿con quién? ¿qué te pareció?"), solo en Rewatch. */
    note?: string;
}

// `key` apunta al array del snapshot compartido (ya no se lee colección a colección).
const COLLECTIONS: { name: string; key: keyof LibrarySnapshot; type: 'movie' | 'serie'; action: string }[] = [
    { name: 'MovieFavs', key: 'movFavs', type: 'movie', action: 'Añadida a Favoritos' },
    { name: 'MoviesPendientes', key: 'movPend', type: 'movie', action: 'Marcada como pendiente' },
    { name: 'MoviesVistas', key: 'movVistos', type: 'movie', action: 'Marcada como vista' },
    { name: 'MoviesVerPronto', key: 'movVerPronto', type: 'movie', action: 'Añadida a Ver Pronto' },
    { name: 'LikedMovies', key: 'movLike', type: 'movie', action: 'Me gusta' },
    { name: 'SeriesFavs', key: 'tvFavs', type: 'serie', action: 'Añadida a Favoritos' },
    { name: 'SeriesPendiente', key: 'tvPend', type: 'serie', action: 'Marcada como pendiente' },
    { name: 'SeriesVistas', key: 'tvVistos', type: 'serie', action: 'Marcada como vista' },
    { name: 'SeriesSiguiendo', key: 'tvSig', type: 'serie', action: 'Empezaste a seguir' },
    { name: 'LikedSeries', key: 'tvLike', type: 'serie', action: 'Me gusta' },
    { name: 'SeriesVerPronto', key: 'tvVerPronto', type: 'serie', action: 'Añadida a Ver Pronto' },
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
            const x = docSnap.data() as { media_type?: string; tmdb_id?: number; season?: number; rewatch?: boolean; logged_at?: unknown; watched_on?: string; note?: string };
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
                ...(x.note ? { note: String(x.note) } : {}),
            });
        }
        return events;
    } catch (error) {
        console.error('Error al leer WatchLog (rewatch):', error);
        return [];
    }
}

// Valoraciones (4.2): cada nota en Ratings → un evento. updated_at marca el
// instante; si updated_at supera a created_at es una edición → "Nota actualizada".
async function fetchRatingEvents(): Promise<ActivityEvent[]> {
    try {
        const snap = await userCol('Ratings').get();
        const events: ActivityEvent[] = [];
        for (const docSnap of snap.docs) {
            const x = docSnap.data() as { media_type?: string; tmdb_id?: string; score?: number; created_at?: unknown; updated_at?: unknown };
            if (!x.score) continue;
            const updated = getFirebaseTimestamp(x.updated_at);
            const created = getFirebaseTimestamp(x.created_at);
            const ts = updated || created;
            if (!ts) continue;
            const edited = created > 0 && updated > 0 && updated - created > 60_000; // >1min = edición real
            events.push({
                type: x.media_type === 'movie' ? 'movie' : 'serie',
                id: String(x.tmdb_id || docSnap.id.replace(/^(movie|tv)_/, '')),
                collection: 'Ratings',
                action: `${edited ? 'Nota actualizada' : 'Has valorado'} · ★ ${x.score}`,
                timestamp: ts,
            });
        }
        return events;
    } catch (error) {
        console.error('Error al leer Ratings:', error);
        return [];
    }
}

// Personas seguidas (Bloque 3): "Empezaste a seguir a X". Avatar circular (no póster).
// FollowedPeople guarda name/profile_path/added_at → sin fetch extra a TMDB.
async function fetchFollowPersonEvents(): Promise<ActivityEvent[]> {
    try {
        const { getAllFollowedPeople } = await import('../people/yourfavsPeople');
        const people = await getAllFollowedPeople();
        return people
            .map((p): ActivityEvent => ({
                type: 'person',
                id: String(p.id),
                collection: 'FollowPerson',
                action: 'Empezaste a seguir',
                timestamp: getFirebaseTimestamp(p.added_at),
                name: p.name,
                profile_path: p.profile_path ?? null,
            }))
            .filter(e => e.timestamp > 0);
    } catch (error) {
        console.error('Error al leer FollowedPeople:', error);
        return [];
    }
}

// Actores en favoritos (Bloque 3): "Añadiste a favoritos a X". Avatar circular.
// ActorsFavs solo guarda { id, added_at, position } → resolvemos nombre/foto por TMDB.
async function fetchActorFavEvents(): Promise<ActivityEvent[]> {
    try {
        const { getActorsFav } = await import('../actors/yourfavsActor');
        const favs = await getActorsFav();
        if (!favs.length) return [];
        const { tmdbFetch } = await import('../../API/shared/tmdbClient');
        const { processBatch } = await import('../../../utils/processBatch');
        const events = await processBatch(
            favs,
            async (f: any): Promise<ActivityEvent | null> => {
                const timestamp = getFirebaseTimestamp(f.added_at);
                if (!timestamp) return null;
                let name = 'Actor';
                let profile_path: string | null = null;
                try {
                    const d = await tmdbFetch<any>(`/person/${f.id}`);
                    if (d?.name) name = d.name;
                    profile_path = d?.profile_path ?? null;
                } catch { /* nombre/foto opcionales */ }
                return {
                    type: 'person', id: String(f.id), collection: 'FavPerson',
                    action: 'Añadiste a favoritos', timestamp, name, profile_path,
                };
            },
            5
        );
        return events.filter(Boolean) as ActivityEvent[];
    } catch (error) {
        console.error('Error al leer ActorsFavs:', error);
        return [];
    }
}

export async function fetchAllActivityEvents(): Promise<ActivityEvent[]> {
    if (!getCurrentUid()) return [];
    // Las 11 listas salen del snapshot compartido (1 lectura), no colección a colección.
    const [snapshot, episodeEvents, rewatchEvents, ratingEvents, personEvents, favPersonEvents] = await Promise.all([
        getLibrarySnapshot(),
        fetchWatchedEpisodeEvents(),
        fetchRewatchEvents(),
        fetchRatingEvents(),
        fetchFollowPersonEvents(),
        fetchActorFavEvents(),
    ]);
    const collectionEvents = COLLECTIONS.flatMap(c =>
        (snapshot[c.key] || [])
            .map((d: any) => ({
                type: c.type,
                id: String(d.id),
                collection: c.name,
                action: c.action,
                timestamp: getFirebaseTimestamp(d.added_at),
            }))
            .filter(e => e.timestamp > 0)
    );
    return [...collectionEvents, ...episodeEvents, ...rewatchEvents, ...ratingEvents, ...personEvents, ...favPersonEvents];
}
