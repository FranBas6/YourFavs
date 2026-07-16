/**
 * Diario de visionado (Fase L5) — `WatchLog` append-only.
 *
 *   users/{uid}/WatchLog/{entryId}   // id autogenerado
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
import { adminDb } from '../../../utils/firebaseAdmin';
import { userCol, getCurrentUid } from '../shared/userScope';

const COLLECTION = 'WatchLog';

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
    note?: string;
    /** Si ya hay una entrada del mismo item, NO añadir otra (evita duplicar al
     *  mover entre listas "visto" o curar algo ya visto). Para pelís vía listas. */
    dedupe?: boolean;
}

/** Añade UNA entrada al diario. Calcula `rewatch` mirando entradas previas del mismo item. */
export async function appendWatchLog(e: AppendInput): Promise<{ rewatch: boolean; added: boolean }> {
    if (!getCurrentUid()) return { rewatch: false, added: false };
    const tmdbId = Number(e.tmdb_id);
    if (!Number.isFinite(tmdbId)) return { rewatch: false, added: false };

    const prior = await userCol(COLLECTION).where('tmdb_id', '==', tmdbId).get();
    const isEp = e.media_type === 'tv' && e.season != null && e.episode != null;
    const rewatch = prior.docs.some((d) => {
        const x = d.data();
        if (x.media_type !== e.media_type) return false;
        if (isEp) return x.season === e.season && x.episode === e.episode;
        return true;
    });
    // dedupe: ya consta como visto → no creamos otra entrada.
    if (e.dedupe && rewatch) return { rewatch: true, added: false };

    const doc: Record<string, unknown> = {
        media_type: e.media_type,
        tmdb_id: tmdbId,
        watched_on: e.watched_on || todayISO(),
        rewatch,
        logged_at: new Date(),
    };
    if (isEp) { doc.season = e.season; doc.episode = e.episode; }
    if (e.note) doc.note = String(e.note).slice(0, 500);

    await userCol(COLLECTION).add(doc);
    return { rewatch, added: true };
}

/**
 * Añade VARIOS episodios de una serie en lote (marcar temporada / todo). Una sola
 * lectura previa para calcular `rewatch` por episodio; escritura en batch.
 */
export async function appendEpisodes(
    serieId: number | string,
    episodes: { season: number; episode: number }[],
    watched_on?: string
): Promise<void> {
    if (!getCurrentUid() || episodes.length === 0) return;
    const tmdbId = Number(serieId);
    if (!Number.isFinite(tmdbId)) return;

    const prior = await userCol(COLLECTION).where('tmdb_id', '==', tmdbId).get();
    const seen = new Set(
        prior.docs
            .map((d) => d.data())
            .filter((x) => x.media_type === 'tv' && x.season != null && x.episode != null)
            .map((x) => `${x.season}:${x.episode}`)
    );

    const date = watched_on || todayISO();
    const now = new Date();
    const batch = adminDb.batch();
    for (const ep of episodes) {
        const key = `${ep.season}:${ep.episode}`;
        const ref = userCol(COLLECTION).doc();
        batch.set(ref, {
            media_type: 'tv',
            tmdb_id: tmdbId,
            season: ep.season,
            episode: ep.episode,
            watched_on: date,
            rewatch: seen.has(key),
            logged_at: now,
        });
        seen.add(key); // por si el lote trae duplicados
    }
    await batch.commit();
}

/** Nº de veces visto + última fecha (para "La has visto N veces" en la ficha). */
export async function countWatches(
    media_type: 'movie' | 'tv',
    tmdb_id: number | string
): Promise<{ count: number; last: string | null }> {
    if (!getCurrentUid()) return { count: 0, last: null };
    const snap = await userCol(COLLECTION).where('tmdb_id', '==', Number(tmdb_id)).get();
    const rows = snap.docs.map((d) => d.data()).filter((x) => x.media_type === media_type);
    if (!rows.length) return { count: 0, last: null };
    const last = rows.map((x) => x.watched_on as string).sort().pop() || null;
    return { count: rows.length, last };
}

/**
 * Entradas del diario en una fecha concreta ("YYYY-MM-DD"). Equality query sobre
 * `watched_on` (indexada → barata). Para la efeméride "Hace un año…" del Brief diario.
 */
export async function getWatchLogOnDate(dateISO: string): Promise<WatchLogEntry[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).where('watched_on', '==', dateISO).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WatchLogEntry));
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
    if (!getCurrentUid()) return { passes: 0, last: null };
    const snap = await userCol(COLLECTION).where('tmdb_id', '==', Number(serieId)).get();
    const rows = snap.docs.map((d) => d.data()).filter((x) => x.media_type === 'tv' && x.season == null);
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
    if (!getCurrentUid()) return { passes: 0, last: null, first: null };
    const snap = await userCol(COLLECTION).where('tmdb_id', '==', Number(tmdb_id)).get();
    const all = snap.docs.map((d) => d.data()).filter((x) => x.media_type === 'movie');
    // `first` = primer visionado registrado (incluye la entrada base, no solo re-visionados),
    // para la efeméride "La viste por primera vez en…" (§6). Sin lecturas extra.
    const first = all.length ? (all.map((x) => x.watched_on as string).filter(Boolean).sort()[0] || null) : null;
    const rows = all.filter((x) => x.rewatch === true);
    if (!rows.length) return { passes: 0, last: null, first };
    const last = rows.map((x) => x.watched_on as string).sort().pop() || null;
    return { passes: rows.length, last, first };
}
