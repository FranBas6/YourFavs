/**
 * Diario de visionado (Fase L5) — `WatchLog` append-only.
 *
 *   watch_log (antes users/{uid}/WatchLog/{entryId})   // id autogenerado
 *     media_type "movie"|"tv" · tmdb_id
 *     season? · episode?        // solo tv
 *     watched_on "YYYY-MM-DD"   // fecha elegida (no timestamp de marcado)
 *     rewatch boolean           // ya existía una entrada previa del mismo item
 *     note? · logged_at         // logged_at = cuándo se registró (para ordenar/ajustar)
 *
 * REGLA DE ORO: es **append-only y desacoplado** del progreso (`WatchedEpisodes`).
 * Vaciar el progreso para rever una serie NO toca el diario. El título/póster NO se
 * congelan aquí: la página del diario (L6) los resuelve por TMDB (como el resto de
 * páginas personales), así los handlers pueden registrar sin datos extra.
 */
import { db, fetchAll, getAuthId, requireAuthId } from '../shared/userScope';
import type { WatchLogRow } from '../shared/episodeWatches';

const COLUMNS = 'id, media_type, tmdb_id, season, episode, watched_on, rewatch, note, logged_at, source';

/** Fila de `watch_log` → la forma de documento de siempre (sin claves a null). */
function toEntry(r: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) if (v !== null) out[k] = v;
    return out;
}

// Los contadores de ficha (countWatches/Passes) miran TODAS las entradas de un título en cada
// carga de ficha. En Firestore eso eran ~220 lecturas para una serie como Naruto; en Postgres
// es una consulta con índice, pero se mantiene una caché corta por (usuario, título) porque la
// ficha pregunta varias veces en el mismo render. Cualquier alta/borrado del título la invalida.
const ROWS_TTL_MS = 5 * 60 * 1000;
const rowsCache = new Map<string, { rows: Record<string, any>[]; expires: number }>();
function rowsKey(userId: string, tmdbId: number): string { return `${userId}:${tmdbId}`; }
function invalidateTitleRows(tmdb_id: number | string): void {
    const userId = getAuthId();
    if (userId) rowsCache.delete(rowsKey(userId, Number(tmdb_id)));
}
// Cualquier escritura del diario cambia el feed de Actividad → invalidamos su caché.
// Import dinámico para NO crear ciclo (activityFeed → librarySnapshot → yourfavsSerie →
// watchLog importaría de vuelta a activityFeed).
async function bustActivityFeed(): Promise<void> {
    try { const m = await import('../shared/activityFeed'); m.invalidateActivityFeed(); } catch { /* ignore */ }
}
async function getTitleRows(tmdb_id: number | string): Promise<Record<string, any>[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const id = Number(tmdb_id);
    if (!Number.isFinite(id)) return [];
    const key = rowsKey(userId, id);
    const cached = rowsCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.rows;
    const data = await fetchAll<Record<string, any>>((from, to) =>
        db().from('watch_log').select(COLUMNS).eq('user_id', userId).eq('tmdb_id', id)
            .order('logged_at').order('id').range(from, to),
    );
    // El id de cada fila permite borrar sin re-consultar (ver removeEpisodeFromLog).
    const rows = data.map(toEntry);
    rowsCache.set(key, { rows, expires: Date.now() + ROWS_TTL_MS });
    return rows;
}

/**
 * El diario ENTERO del usuario (Tu año, Actividad). En Firestore era la lectura más cara de
 * la app (una por entrada: ~2.200 para ti); aquí son 3 peticiones de 1000 filas.
 */
export async function getAllWatchLog(): Promise<WatchLogRow[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const data = await fetchAll<Record<string, any>>((from, to) =>
        db().from('watch_log').select(COLUMNS).eq('user_id', userId)
            .order('logged_at').order('id').range(from, to),
    );
    return data.map(toEntry) as WatchLogRow[];
}

export interface WatchLogEntry {
    id: string;
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    season?: number;
    episode?: number;
    watched_on: string;   // YYYY-MM-DD
    rewatch: boolean;
    note?: string;
    logged_at?: unknown;
}

export function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

interface AppendInput {
    media_type: 'movie' | 'tv';
    tmdb_id: number | string;
    season?: number;
    episode?: number;
    watched_on?: string;
    /** Hora real del visionado (al deshacer un desmarcado: la que tenía). Sin ella, ahora. */
    logged_at?: string;
    note?: string;
    /** Si ya hay una entrada del mismo item, NO añadir otra (evita duplicar al
     *  mover entre listas "visto" o curar algo ya visto). Para pelís vía listas. */
    dedupe?: boolean;
}

/** Añade UNA entrada al diario. Calcula `rewatch` mirando entradas previas del mismo item. */
export async function appendWatchLog(e: AppendInput): Promise<{ rewatch: boolean; added: boolean }> {
    const userId = getAuthId();
    if (!userId) return { rewatch: false, added: false };
    const tmdbId = Number(e.tmdb_id);
    if (!Number.isFinite(tmdbId)) return { rewatch: false, added: false };

    // ¿Ya había una entrada del mismo item? Antes se leían TODAS las del título (cientos en
    // una serie larga) para mirarlas en JS; ahora se cuenta en la BD.
    const isEp = e.media_type === 'tv' && e.season != null && e.episode != null;
    let prior = db().from('watch_log').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('tmdb_id', tmdbId).eq('media_type', e.media_type);
    if (isEp) prior = prior.eq('season', e.season!).eq('episode', e.episode!);
    const { count, error: priorError } = await prior;
    if (priorError) throw new Error(priorError.message);
    const rewatch = (count ?? 0) > 0;
    // dedupe: ya consta como visto → no creamos otra entrada.
    if (e.dedupe && rewatch) return { rewatch: true, added: false };

    const { error } = await db().from('watch_log').insert({
        user_id: userId,
        media_type: e.media_type,
        tmdb_id: tmdbId,
        watched_on: e.watched_on || todayISO(),
        rewatch,
        logged_at: e.logged_at || new Date().toISOString(),
        season: isEp ? e.season! : null,
        episode: isEp ? e.episode! : null,
        note: e.note ? String(e.note).slice(0, 500) : null,
    });
    if (error) throw new Error(error.message);
    invalidateTitleRows(tmdbId);
    await bustActivityFeed();
    return { rewatch, added: true };
}

/**
 * Añade VARIOS episodios de una serie en lote (marcar temporada / todo). Una sola
 * consulta previa para calcular `rewatch` por episodio; una inserción para todos.
 */
export async function appendEpisodes(
    serieId: number | string,
    episodes: { season: number; episode: number }[],
    watched_on?: string
): Promise<void> {
    const userId = getAuthId();
    if (!userId || episodes.length === 0) return;
    const tmdbId = Number(serieId);
    if (!Number.isFinite(tmdbId)) return;

    // Solo las columnas que hacen falta para saber qué episodios ya constaban.
    const prior = await fetchAll<{ season: number; episode: number }>((from, to) =>
        db().from('watch_log').select('season, episode')
            .eq('user_id', userId).eq('tmdb_id', tmdbId).eq('media_type', 'tv')
            .not('season', 'is', null).not('episode', 'is', null)
            .order('logged_at').order('id').range(from, to),
    );
    const seen = new Set(prior.map((x) => `${x.season}:${x.episode}`));

    const date = watched_on || todayISO();
    const now = new Date().toISOString();
    const rows = episodes.map((ep) => {
        const key = `${ep.season}:${ep.episode}`;
        const row = {
            user_id: userId,
            media_type: 'tv' as const,
            tmdb_id: tmdbId,
            season: ep.season,
            episode: ep.episode,
            watched_on: date,
            rewatch: seen.has(key),
            logged_at: now,
        };
        seen.add(key); // por si el lote trae duplicados
        return row;
    });
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db().from('watch_log').insert(rows.slice(i, i + 500));
        if (error) throw new Error(error.message);
    }
    invalidateTitleRows(tmdbId);
    await bustActivityFeed();
}

/**
 * Corrección de un episodio marcado por error: borra su entrada MÁS RECIENTE del
 * diario (no todas), de modo que desmarcar "deshace" solo la última marca y
 * conserva re-visionados anteriores del mismo episodio. Es la ÚNICA excepción a la
 * regla append-only, y solo la dispara el toggle de UN episodio en la ficha
 * (los vaciados en bloque —temporada/serie— NO tocan el diario: son "volver a ver").
 */
export async function removeEpisodeFromLog(
    serieId: number | string,
    season: number,
    episode: number
): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    const tmdbId = Number(serieId);
    if (!Number.isFinite(tmdbId)) return;

    // Reutiliza la caché por título (la ficha ya la cargó al contar "N veces") → 0
    // lecturas en caliente, en vez de re-escanear todo el WatchLog de la serie.
    const rows = await getTitleRows(tmdbId);
    const matches = rows.filter((x) => x.media_type === 'tv' && x.season === Number(season) && x.episode === Number(episode));
    if (!matches.length) return;

    const tsOf = (x: Record<string, any>): number => {
        if (x.logged_at) return new Date(x.logged_at).getTime() || 0;
        if (x.watched_on) return new Date(x.watched_on).getTime() || 0;
        return 0;
    };
    matches.sort((a, b) => tsOf(b) - tsOf(a)); // más reciente primero
    const { error } = await db().from('watch_log').delete().eq('user_id', requireAuthId()).eq('id', matches[0].id);
    if (error) throw new Error(error.message);
    invalidateTitleRows(tmdbId);
    await bustActivityFeed();
}

/** Nº de veces visto + última fecha (para "La has visto N veces" en la ficha). */
export async function countWatches(
    media_type: 'movie' | 'tv',
    tmdb_id: number | string
): Promise<{ count: number; last: string | null }> {
    if (!getAuthId()) return { count: 0, last: null };
    const rows = (await getTitleRows(tmdb_id)).filter((x) => x.media_type === media_type);
    if (!rows.length) return { count: 0, last: null };
    const last = rows.map((x) => x.watched_on as string).sort().pop() || null;
    return { count: rows.length, last };
}

/**
 * Entradas del diario en una fecha concreta ("YYYY-MM-DD"). Equality query sobre
 * `watched_on` (índice watch_log_by_day → barata). Para la efeméride "Hace un año…" del Brief diario.
 */
export async function getWatchLogOnDate(dateISO: string): Promise<WatchLogEntry[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const { data, error } = await db().from('watch_log').select(COLUMNS).eq('user_id', userId).eq('watched_on', dateISO);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntry(r) as WatchLogEntry);
}

/**
 * "Pases" de una serie = entradas de nivel SERIE (sin season/episode), que crea el
 * botón "Vuelto a ver". El primer visionado NO crea entrada (se deriva de estar
 * vista/en lista); aquí solo contamos los re-visionados explícitos. Para "Vista N
 * veces" la ficha hace: base(1 si vista) + passes.
 */
export async function countSeriesPasses(
    serieId: number | string
): Promise<{ passes: number; last: string | null }> {
    if (!getAuthId()) return { passes: 0, last: null };
    const rows = (await getTitleRows(serieId)).filter((x) => x.media_type === 'tv' && x.season == null);
    if (!rows.length) return { passes: 0, last: null };
    const last = rows.map((x) => x.watched_on as string).sort().pop() || null;
    return { passes: rows.length, last };
}

/**
 * "Pases" de una PELÍCULA = re-visionados explícitos (entradas con `rewatch=true`),
 * el equivalente de `countSeriesPasses`. El visionado original NO cuenta aquí: se
 * deriva de estar vista/en lista. Para "Vista N veces" la ficha hace base(1 si
 * vista) + passes. La entrada base (auto-append al marcar visto, o el backfill del
 * diario) queda con `rewatch=false` y por tanto NO se cuenta como pase — solo suma
 * el botón "Vuelto a ver", que al existir ya la base se registra como `rewatch=true`.
 */
export async function countMoviePasses(
    tmdb_id: number | string
): Promise<{ passes: number; last: string | null; first: string | null }> {
    if (!getAuthId()) return { passes: 0, last: null, first: null };
    const all = (await getTitleRows(tmdb_id)).filter((x) => x.media_type === 'movie');
    // `first` = primer visionado registrado (incluye la entrada base, no solo re-visionados),
    // para la efeméride "La viste por primera vez en…" (§6). Sin lecturas extra.
    const first = all.length ? (all.map((x) => x.watched_on as string).filter(Boolean).sort()[0] || null) : null;
    const rows = all.filter((x) => x.rewatch === true);
    if (!rows.length) return { passes: 0, last: null, first };
    const last = rows.map((x) => x.watched_on as string).sort().pop() || null;
    return { passes: rows.length, last, first };
}
