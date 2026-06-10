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

/** Cambia la fecha de la entrada MÁS RECIENTE de un item (para el popover "¿cuándo?"). */
export async function adjustLastWatchDate(
    media_type: 'movie' | 'tv',
    tmdb_id: number | string,
    watched_on: string
): Promise<void> {
    if (!getCurrentUid()) return;
    const tmdbId = Number(tmdb_id);
    const snap = await userCol(COLLECTION).where('tmdb_id', '==', tmdbId).get();
    const entries = snap.docs
        .filter((d) => d.data().media_type === media_type)
        .sort((a, b) => millis(b.data().logged_at) - millis(a.data().logged_at));
    if (!entries.length) return;
    await entries[0].ref.update({ watched_on });
}

function millis(v: any): number {
    return (v && typeof v.toMillis === 'function') ? v.toMillis() : 0;
}

/** Cambia la fecha de una entrada concreta del diario (edición desde la página). */
export async function setWatchLogDate(entryId: string, watched_on: string): Promise<void> {
    if (!getCurrentUid() || !entryId) return;
    await userCol(COLLECTION).doc(entryId).update({ watched_on });
}

/** Borra una entrada concreta del diario (corrección manual del usuario). */
export async function deleteWatchLogEntry(entryId: string): Promise<void> {
    if (!getCurrentUid() || !entryId) return;
    await userCol(COLLECTION).doc(entryId).delete();
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

/** Entradas del diario (orden desc por fecha), opcionalmente acotadas a un rango. */
export async function getWatchLog(opts?: { from?: string; to?: string }): Promise<WatchLogEntry[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).get();
    let rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as WatchLogEntry);
    if (opts?.from) rows = rows.filter((r) => r.watched_on >= opts.from!);
    if (opts?.to) rows = rows.filter((r) => r.watched_on <= opts.to!);
    rows.sort((a, b) => b.watched_on.localeCompare(a.watched_on));
    return rows;
}
