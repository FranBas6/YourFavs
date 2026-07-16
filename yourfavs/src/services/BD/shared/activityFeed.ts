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

// Episodios vistos → append-only. Fuente PRIMARIA = `WatchLog` (una entrada por
// visionado, nunca se borra al desmarcar), así el diario del feed no se pierde
// cuando se vacía el progreso. `WatchedEpisodes` (estado vivo) SOLO aporta los
// episodios que WatchLog nunca vio (marcados antes de existir el diario / Fase L5):
// así arreglamos el bug de pérdida de historial sin perder el histórico previo.
async function fetchWatchedEpisodeEvents(
    logDocs: FirebaseFirestore.QueryDocumentSnapshot[],
    liveDocs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<ActivityEvent[]> {
    try {
        // serieId → { covered: claves "s:e" ya cubiertas por WatchLog,
        //             byDay: buckets por día calendario }
        const bySerie = new Map<string, {
            covered: Set<string>;
            byDay: Map<string, { ts: number; eps: { season: number; episode: number }[] }>;
        }>();
        const bucketFor = (id: string) => {
            let s = bySerie.get(id);
            if (!s) { s = { covered: new Set(), byDay: new Map() }; bySerie.set(id, s); }
            return s;
        };
        const pushEp = (serie: { byDay: Map<string, { ts: number; eps: { season: number; episode: number }[] }> }, ts: number, season: number, episode: number) => {
            const key = dayKey(ts);
            const bucket = serie.byDay.get(key);
            if (bucket) {
                bucket.eps.push({ season, episode });
                if (ts > bucket.ts) bucket.ts = ts;
            } else {
                serie.byDay.set(key, { ts, eps: [{ season, episode }] });
            }
        };

        // 1) WatchLog (fuente primaria). Solo entradas de episodio (tv con season+episode).
        for (const docSnap of logDocs) {
            const x = docSnap.data() as { media_type?: string; tmdb_id?: number; season?: number; episode?: number; watched_on?: string; logged_at?: unknown };
            if (x.media_type !== 'tv' || x.season == null || x.episode == null) continue;
            // Hora REAL de marcado desde logged_at (instante absoluto de Firestore).
            // watched_on es solo fecha → usarlo daba las 12:00 (comodín) y, peor, variaba
            // con la tz del runtime (12:00 en dev / 14:00 en prod). logged_at no ambiguo.
            let ts = getFirebaseTimestamp(x.logged_at);
            if (!ts && x.watched_on) ts = new Date(x.watched_on + 'T12:00:00').getTime(); // fallback entradas viejas sin logged_at
            if (!ts || isNaN(ts)) continue;
            const serie = bucketFor(String(x.tmdb_id));
            serie.covered.add(`${x.season}:${x.episode}`);
            pushEp(serie, ts, x.season, x.episode);
        }

        // 2) WatchedEpisodes (relleno): solo episodios que WatchLog nunca vio.
        for (const docSnap of liveDocs) {
            const data = docSnap.data() as { watched_episodes?: { season: number; episode: number; watched_at?: string }[] };
            const serie = bucketFor(docSnap.id);
            for (const ep of data.watched_episodes || []) {
                if (serie.covered.has(`${ep.season}:${ep.episode}`)) continue; // ya cubierto por WatchLog
                const ts = ep.watched_at ? new Date(ep.watched_at).getTime() : 0;
                if (!ts || isNaN(ts)) continue;
                pushEp(serie, ts, ep.season, ep.episode);
            }
        }

        // 3) Un evento por (serie, día), con el mismo etiquetado agrupado de antes.
        const events: ActivityEvent[] = [];
        for (const [serieId, { byDay }] of bySerie) {
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
                    id: serieId,
                    collection: 'WatchedEpisodes',
                    action,
                    timestamp: ts,
                    episodes: dayEps,
                });
            }
        }
        return events;
    } catch (error) {
        console.error('Error al leer episodios vistos (WatchLog∪WatchedEpisodes):', error);
        return [];
    }
}

// Re-visionados explícitos del botón "Vuelto a ver" (WatchLog): pelis con
// rewatch=true y "pases" de serie (entradas a nivel serie, sin season). NO los
// episodios sueltos (esos ya salen vía WatchedEpisodes; no duplicamos).
async function fetchRewatchEvents(
    logDocs: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<ActivityEvent[]> {
    try {
        const events: ActivityEvent[] = [];
        for (const docSnap of logDocs) {
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

// §5 · acciones intencionales no derivables (colección `Activity` append-only):
// quitar de una lista, dejar de seguir, abandonar/retomar, reordenar favoritos.
// Cada verbo se traduce a un `collection` propio que la página de Actividad colorea.
const REMOVE_LABEL: Record<string, string> = {
    MovieFavs: 'Quitada de Favoritos', SeriesFavs: 'Quitada de Favoritos',
    MoviesPendientes: 'Quitada de Pendientes', SeriesPendiente: 'Quitada de Pendientes',
    MoviesVistas: 'Quitada de Vistas', SeriesVistas: 'Quitada de Vistas',
    MoviesVerPronto: 'Quitada de Ver Pronto', SeriesVerPronto: 'Quitada de Ver Pronto',
    LikedMovies: 'Quitada de Me gusta', LikedSeries: 'Quitada de Me gusta',
};

async function fetchMutationEvents(): Promise<ActivityEvent[]> {
    try {
        const { listActivity } = await import('./activityLog');
        const records = await listActivity();
        const out: ActivityEvent[] = [];
        for (const r of records) {
            const timestamp = getFirebaseTimestamp(r.logged_at);
            if (!timestamp) continue;
            const type: ActivityEvent['type'] = r.media_type === 'person' ? 'person' : r.media_type === 'movie' ? 'movie' : 'serie';
            const id = String(r.tmdb_id);
            const meta = (r.meta || {}) as Record<string, any>;
            switch (r.verb) {
                case 'remove':
                    out.push({ type, id, collection: 'ActRemove', timestamp,
                        action: meta.custom ? 'Quitada de una colección' : (REMOVE_LABEL[meta.collection] || 'Quitada de una lista') });
                    break;
                case 'unfollow':
                    out.push({ type, id, collection: 'ActUnfollow', action: 'Dejaste de seguir', timestamp,
                        ...(type === 'person' ? { name: meta.name || 'Persona', profile_path: meta.profile_path ?? null } : {}) });
                    break;
                case 'abandon':
                    out.push({ type, id, collection: 'ActAbandon', action: 'Abandonaste', timestamp });
                    break;
                case 'resume':
                    out.push({ type, id, collection: 'ActResume', action: 'Retomaste', timestamp });
                    break;
                case 'reorder':
                    out.push({ type, id, collection: 'ActReorder', action: `Moviste a #${meta.to ?? '?'}`, timestamp });
                    break;
            }
        }
        return out;
    } catch (error) {
        console.error('Error al leer Activity (mutaciones):', error);
        return [];
    }
}

// Dieta de lecturas: el feed escanea WatchLog + WatchedEpisodes + 11 listas + Ratings +
// personas → la página más cara. Cache por uid para abrirla varias veces sin re-escanear.
// A diferencia de un TTL "a secas", se INVALIDA en las mutaciones que cambian el feed
// (episodios marcar/desmarcar y listas añadir/quitar/abandonar/…), así nunca muestra
// historial desfasado justo tras una acción. El TTL es solo un backstop.
const FEED_TTL_MS = 60 * 1000;
const feedCache = new Map<string, { data: ActivityEvent[]; expires: number }>();
export function invalidateActivityFeed(uid?: string): void {
    if (uid) feedCache.delete(uid); else feedCache.clear();
}

export async function fetchAllActivityEvents(): Promise<ActivityEvent[]> {
    const uid = getCurrentUid();
    if (!uid) return [];
    const cachedFeed = feedCache.get(uid);
    if (cachedFeed && cachedFeed.expires > Date.now()) return cachedFeed.data;
    // WatchLog se lee UNA sola vez y se comparte entre episodios vistos y re-visionados
    // (antes se escaneaba dos veces → doble de lecturas en la colección más grande).
    const [snapshot, logSnap, liveSnap] = await Promise.all([
        getLibrarySnapshot(),          // las 11 listas (1 lectura cacheada)
        userCol('WatchLog').get(),
        userCol('WatchedEpisodes').get(),
    ]);
    const [episodeEvents, rewatchEvents, ratingEvents, personEvents, favPersonEvents, mutationEvents] = await Promise.all([
        fetchWatchedEpisodeEvents(logSnap.docs, liveSnap.docs),
        fetchRewatchEvents(logSnap.docs),
        fetchRatingEvents(),
        fetchFollowPersonEvents(),
        fetchActorFavEvents(),
        fetchMutationEvents(),
    ]);
    // Al retomar una serie abandonada vuelve a SeriesSiguiendo con added_at nuevo → el
    // alta derivada "Empezaste a seguir" duplicaría el evento "Retomaste". La suprimimos:
    // el evento 'resume' es dueño de la vuelta al seguimiento.
    const resumedSerieIds = new Set(mutationEvents.filter(e => e.collection === 'ActResume').map(e => e.id));
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
            .filter(e => !(e.collection === 'SeriesSiguiendo' && resumedSerieIds.has(e.id)))
    );
    const events = [...collectionEvents, ...episodeEvents, ...rewatchEvents, ...ratingEvents, ...personEvents, ...favPersonEvents, ...mutationEvents];
    feedCache.set(uid, { data: events, expires: Date.now() + FEED_TTL_MS });
    return events;
}
