import { getCurrentUid } from "./userScope";
import type { LiveProgress, WatchLogRow } from "./episodeWatches";
import { getLibrarySnapshot, type LibrarySnapshot } from "./librarySnapshot";
import { toTimestamp, formatScore } from "../../../utils/constants/helpers/media-helpers";

export interface ActivityEvent {
    type: 'movie' | 'serie' | 'person';
    id: string;
    collection: string;
    action: string;
    /** Instante del evento. En una sesión de episodios, el del ÚLTIMO marcado. */
    timestamp: number;
    /** Solo sesiones de episodios: instante del PRIMER episodio de la tanda (para el rango de horas). */
    startTs?: number;
    /** `ts` = instante real de cada episodio (falta si viene del backfill sin hora fiable). */
    episodes?: { season: number; episode: number; ts?: number }[];
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

/**
 * Corte de sesión: hueco máximo entre dos episodios para seguir considerándolos la
 * misma tanda. Agrupar por día natural mentía sobre el "cuándo" (3 episodios a las
 * 00:50 y otros 3 a las 23:58 del mismo día salían como un solo evento a las 23:58).
 */
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;
/**
 * Margen para no cortar por la propia cascada de una acción: añadir a Favoritos
 * arrastra el título a Vistas con el MISMO instante, y eso no es "algo que hiciste
 * entre dos episodios".
 */
const CUT_EPSILON_MS = 1000;

/** Instante que puede partir una sesión: otro evento del feed, o un episodio de otra serie. */
type CutPoint = { ts: number; serie: string | null };

/** Primer índice con ts >= v (los cut points llegan ya ordenados). */
function lowerBound(arr: CutPoint[], v: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].ts < v) lo = mid + 1; else hi = mid;
    }
    return lo;
}

// Episodios vistos → append-only. Fuente PRIMARIA de la HORA = `WatchedEpisodes`
// (`watched_at` es el instante real); `WatchLog` solo rellena los episodios que ya no
// están marcados, para no perder historial al vaciar el progreso (bug §5).
//
// Agrupado por SESIÓN, no por día: se corta cuando hay un hueco > SESSION_GAP_MS o
// cuando entre dos episodios ocurrió otra cosa (guardar en una lista, valorar, ver un
// episodio de otra serie…). La segunda regla usa una señal real en vez de adivinar.
async function fetchWatchedEpisodeEvents(
    logRows: WatchLogRow[],
    live: LiveProgress[],
    cutPoints: CutPoint[] = [],
): Promise<ActivityEvent[]> {
    try {
        // serieId → { covered: claves "s:e" ya contabilizadas, eps: episodios con su instante }
        // `synthetic` = la hora no es real (backfill anclado a mediodía) → no participa en
        // la regla de interleaving, solo en la del hueco.
        type EpEntry = { season: number; episode: number; ts: number; synthetic: boolean };
        const bySerie = new Map<string, { covered: Set<string>; eps: EpEntry[] }>();
        const bucketFor = (id: string) => {
            let s = bySerie.get(id);
            if (!s) { s = { covered: new Set(), eps: [] }; bySerie.set(id, s); }
            return s;
        };

        // 1) WatchedEpisodes (fuente PRIMARIA de la HORA). watched_at es el instante REAL
        //    de cada visionado (ISO absoluto) → el reloj cliente lo pinta bien en Madrid,
        //    sin el desfase de mediodía. Cubre lo que sigue marcado (el caso normal).
        for (const data of live) {
            const serie = bucketFor(data.id);
            for (const ep of data.watched_episodes || []) {
                const ts = ep.watched_at ? new Date(ep.watched_at).getTime() : 0;
                if (!ts || isNaN(ts)) continue;
                serie.covered.add(`${ep.season}:${ep.episode}`);
                serie.eps.push({ season: ep.season, episode: ep.episode, ts, synthetic: false });
            }
        }

        // 2) WatchLog (relleno append-only): SOLO episodios que ya NO están en
        //    WatchedEpisodes (desmarcados para volver a ver) → así no se pierde el
        //    historial (bug §5). Su HORA: logged_at real si no es del backfill; los del
        //    backfill (o sin hora) caen a mediodía UTC del watched_on (día real, estable).
        for (const x of logRows) {
            if (x.media_type !== 'tv' || x.season == null || x.episode == null) continue;
            const serie = bucketFor(String(x.tmdb_id));
            if (serie.covered.has(`${x.season}:${x.episode}`)) continue; // ya cubierto por watched_at
            const loggedMs = toTimestamp(x.logged_at);
            const realHour = Boolean(loggedMs) && x.source !== 'backfill' && x.source !== 'import';
            const ts = realHour
                ? loggedMs
                : (x.watched_on ? new Date(x.watched_on + 'T12:00:00Z').getTime() : loggedMs);
            if (!ts || isNaN(ts)) continue;
            serie.covered.add(`${x.season}:${x.episode}`);
            serie.eps.push({ season: x.season, episode: x.episode, ts, synthetic: !realHour });
        }

        // 3) Cut points: los eventos ajenos ya resueltos + los episodios de OTRAS series.
        //    No hay circularidad: se comparan instantes individuales, nunca grupos ya formados.
        const cuts: CutPoint[] = [...cutPoints];
        for (const [serieId, { eps }] of bySerie) {
            for (const ep of eps) if (!ep.synthetic) cuts.push({ ts: ep.ts, serie: serieId });
        }
        cuts.sort((a, b) => a.ts - b.ts);
        /** ¿Ocurrió algo ajeno a esta serie estrictamente entre estos dos instantes? */
        const hasCutBetween = (from: number, to: number, serieId: string): boolean => {
            for (let i = lowerBound(cuts, from + CUT_EPSILON_MS); i < cuts.length; i++) {
                if (cuts[i].ts > to - CUT_EPSILON_MS) return false;
                if (cuts[i].serie !== serieId) return true;
            }
            return false;
        };

        // 4) Un evento por SESIÓN, con el mismo etiquetado agrupado de antes.
        const events: ActivityEvent[] = [];
        const pushSession = (serieId: string, group: EpEntry[]) => {
            const startTs = group[0].ts;                    // group viene ordenado por ts
            const endTs = group[group.length - 1].ts;
            const eps = [...group].sort((a, b) => a.season - b.season || a.episode - b.episode);
            const seasons = Array.from(new Set(eps.map(e => e.season))).sort((a, b) => a - b);
            const isContiguous = seasons.every((s, i) => i === 0 || s === seasons[i - 1] + 1);
            const seasonLabel = seasons.length === 1
                ? `T${seasons[0]}`
                : isContiguous
                    ? `T${seasons[0]}-T${seasons[seasons.length - 1]}`
                    : seasons.map(s => `T${s}`).join(', ');
            let action: string;
            if (eps.length === 1) {
                action = `Episodio T${eps[0].season} E${eps[0].episode} visto`;
            } else if (seasons.length === 1 && eps.length <= 4) {
                const list = eps.map(e => `E${e.episode}`).join(', ');
                action = `${seasonLabel} ${list} vistos (${eps.length})`;
            } else {
                action = `${eps.length} episodios vistos · ${seasonLabel}`;
            }
            events.push({
                type: 'serie',
                id: serieId,
                collection: 'WatchedEpisodes',
                action,
                timestamp: endTs,
                startTs,
                // Los del backfill no llevan hora fiable → sin `ts` para que la UI no la pinte.
                episodes: eps.map(e => (e.synthetic ? { season: e.season, episode: e.episode } : { season: e.season, episode: e.episode, ts: e.ts })),
            });
        };

        for (const [serieId, { eps }] of bySerie) {
            eps.sort((a, b) => a.ts - b.ts);
            let group: EpEntry[] = [];
            for (let i = 0; i < eps.length; i++) {
                if (group.length > 0) {
                    const prev = eps[i - 1];
                    const cur = eps[i];
                    const gapCut = cur.ts - prev.ts > SESSION_GAP_MS;
                    const interleaveCut = !prev.synthetic && !cur.synthetic && hasCutBetween(prev.ts, cur.ts, serieId);
                    if (gapCut || interleaveCut) { pushSession(serieId, group); group = []; }
                }
                group.push(eps[i]);
            }
            if (group.length > 0) pushSession(serieId, group);
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
    logRows: WatchLogRow[],
): Promise<ActivityEvent[]> {
    try {
        const events: ActivityEvent[] = [];
        for (const x of logRows as (WatchLogRow & { note?: string })[]) {
            const isMovieRewatch = x.media_type === 'movie' && x.rewatch === true;
            const isSeriesPass = x.media_type === 'tv' && x.season == null;
            if (!isMovieRewatch && !isSeriesPass) continue;
            let ts = toTimestamp(x.logged_at);
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

// Valoraciones (4.2): cada nota en `ratings` → un evento. updated_at marca el
// instante; si updated_at supera a created_at es una edición → "Nota actualizada".
async function fetchRatingEvents(): Promise<ActivityEvent[]> {
    try {
        const { listRatings } = await import('../lists/ratings');
        const events: ActivityEvent[] = [];
        for (const x of await listRatings()) {
            if (!x.score) continue;
            const updated = toTimestamp(x.updated_at);
            const created = toTimestamp(x.created_at);
            const ts = updated || created;
            if (!ts) continue;
            const edited = created > 0 && updated > 0 && updated - created > 60_000; // >1min = edición real
            events.push({
                type: x.media_type === 'movie' ? 'movie' : 'serie',
                id: String(x.tmdb_id),
                collection: 'Ratings',
                action: `${edited ? 'Nota actualizada' : 'Has valorado'} · ★ ${formatScore(Number(x.score))}`,
                timestamp: ts,
            });
        }
        return events;
    } catch (error) {
        console.error('Error al leer Ratings:', error);
        return [];
    }
}

// Personas con avisos (Bloque 3): "X · Avisos activados". Avatar circular (no póster).
// Por dentro es FollowedPeople, pero «seguir» se reserva para seguir a otros usuarios.
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
                action: 'Avisos activados',
                timestamp: toTimestamp(p.added_at),
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
                const timestamp = toTimestamp(f.added_at);
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
            const timestamp = toTimestamp(r.logged_at);
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
                    out.push({ type, id, collection: 'ActUnfollow', action: type === 'person' ? 'Avisos desactivados' : 'Dejaste de seguir', timestamp,
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
    const { getAllWatchedProgress } = await import('../series/yourfavsSerie');
    const { getAllWatchLog } = await import('../lists/watchLog');
    const [snapshot, logRows, live] = await Promise.all([
        getLibrarySnapshot(),          // las listas (cacheado)
        getAllWatchLog(),
        getAllWatchedProgress(),
    ]);
    // Los episodios se agrupan AL FINAL: necesitan conocer el resto de eventos para poder
    // cortar la sesión cuando entre dos episodios ocurrió otra cosa. El builder de episodios
    // no consulta la base de datos (recibe las filas), así que sacarlo del Promise.all no cuesta nada.
    const [rewatchEvents, ratingEvents, personEvents, favPersonEvents, mutationEvents] = await Promise.all([
        fetchRewatchEvents(logRows),
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
                timestamp: toTimestamp(d.added_at),
            }))
            .filter(e => e.timestamp > 0)
            .filter(e => !(e.collection === 'SeriesSiguiendo' && resumedSerieIds.has(e.id)))
    );
    // Añadir a Favoritos / Me gusta arrastra el título a "Vistas" en cascada (alsoAdd),
    // con el MISMO added_at → generaba 2 eventos ("Añadida a Favoritos" + "Marcada como
    // vista") por una sola acción. Suprimimos el de "Vistas" cuando existe un Fav/Like del
    // mismo título en el mismo instante (±5s): esa marca de vista es consecuencia, no acción.
    const FAV_LIKE = new Set(['MovieFavs', 'SeriesFavs', 'LikedMovies', 'LikedSeries']);
    const favLikeStamps = new Map<string, number[]>(); // "type:id" → timestamps de fav/like
    for (const e of collectionEvents) {
        if (!FAV_LIKE.has(e.collection)) continue;
        const k = `${e.type}:${e.id}`;
        (favLikeStamps.get(k) ?? favLikeStamps.set(k, []).get(k)!).push(e.timestamp);
    }
    const dedupedCollectionEvents = collectionEvents.filter(e => {
        if (e.collection !== 'MoviesVistas' && e.collection !== 'SeriesVistas') return true;
        const stamps = favLikeStamps.get(`${e.type}:${e.id}`);
        return !stamps?.some(t => Math.abs(t - e.timestamp) < 5000); // cascada → fuera
    });
    // Ya tenemos todo lo ajeno a los episodios (y sin los duplicados de cascada, que si no
    // partirían sesiones por una acción que en realidad fue una sola) → cut points.
    const cutPoints: CutPoint[] = [...dedupedCollectionEvents, ...rewatchEvents, ...ratingEvents, ...personEvents, ...favPersonEvents, ...mutationEvents]
        .filter(e => e.timestamp > 0)
        .map(e => ({ ts: e.timestamp, serie: null }));
    const episodeEvents = await fetchWatchedEpisodeEvents(logRows, live, cutPoints);
    const events = [...dedupedCollectionEvents, ...episodeEvents, ...rewatchEvents, ...ratingEvents, ...personEvents, ...favPersonEvents, ...mutationEvents];
    feedCache.set(uid, { data: events, expires: Date.now() + FEED_TTL_MS });
    return events;
}
