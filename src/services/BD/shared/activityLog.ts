/**
 * Bitácora de acciones intencionales (§5) — `Activity` append-only.
 *
 *   activity (antes users/{uid}/Activity/{entryId})   // id autogenerado
 *     verb        "unwatch"|"remove"|"unfollow"|"reorder"|"abandon"|"resume"…
 *     media_type  "movie"|"tv"|"person"
 *     tmdb_id     number
 *     logged_at   Date        // cuándo ocurrió (para ordenar el feed)
 *     meta?       objeto libre // { count, seasonLabel, list, position, name, profile_path… }
 *
 * REGLA DE ORO (misma que `WatchLog`): es **append-only y desacoplado** del estado.
 * Registramos SOLO lo que el usuario hace a propósito y NO es derivable del estado
 * actual (desmarcar, quitar de una lista, dejar de seguir, reordenar, abandonar…).
 * Las ALTAS siguen derivándose de `added_at` (coste 0, duraderas) — no van aquí.
 * Las consecuencias automáticas (recolocar +1 al insertar favorito, auto-quitar de
 * Pendientes al marcar Visto, recuentos que cambian solos) NO se registran.
 *
 * El título/póster NO se congelan aquí: la página de Actividad los resuelve por TMDB,
 * igual que el resto de fuentes del feed; así los handlers registran sin datos extra.
 */
import { db, fetchAll, getAuthId } from './userScope';

export type ActivityVerb =
    | 'unwatch'    // desmarcar / vaciar episodios
    | 'remove'     // quitar de una lista (fija o custom)
    | 'unfollow'   // dejar de seguir serie o persona
    | 'reorder'    // mover un favorito de posición (solo SeriesFavs)
    | 'abandon'    // abandonar una serie a medias (§1)
    | 'resume';    // retomar una serie abandonada (§1)

export interface ActivityInput {
    verb: ActivityVerb;
    media_type: 'movie' | 'tv' | 'person';
    tmdb_id: number | string;
    /** Datos ligeros para pintar el evento sin re-derivar nada. */
    meta?: Record<string, unknown>;
}

export interface ActivityRecord extends ActivityInput {
    id: string;
    tmdb_id: number;
    logged_at?: unknown;
}

/**
 * Registra UNA acción intencional. Best-effort: nunca debe romper la acción que la
 * origina (los handlers la llaman dentro de un try/catch, como el diario).
 */
export async function appendActivity(e: ActivityInput): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    const tmdbId = Number(e.tmdb_id);
    if (!Number.isFinite(tmdbId)) return;

    const { error } = await db().from('activity').insert({
        user_id: userId,
        verb: e.verb,
        media_type: e.media_type,
        tmdb_id: tmdbId,
        logged_at: new Date().toISOString(),
        meta: e.meta && Object.keys(e.meta).length ? (e.meta as never) : null,
    });
    if (error) throw new Error(error.message);
    // Toda acción intencional (quitar/dejar de seguir/abandonar/retomar/reordenar) pasa
    // por aquí → invalidamos la caché del feed de Actividad en un solo sitio (import
    // dinámico para evitar ciclo; activityFeed importa activityLog dinámicamente también).
    try { const m = await import('./activityFeed'); m.invalidateActivityFeed(); } catch { /* ignore */ }
}

/** Todas las entradas de la bitácora (el feed las ordena/mezcla con el resto de fuentes). */
export async function listActivity(): Promise<ActivityRecord[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<Record<string, any>>((from, to) =>
        db().from('activity').select('id, verb, media_type, tmdb_id, logged_at, meta')
            .eq('user_id', userId).order('logged_at').order('id').range(from, to),
    );
    // Sin `meta` a null: la forma de siempre, donde el campo simplemente no existía.
    return rows.map(({ meta, ...r }) => ({ ...r, ...(meta ? { meta } : {}) }) as ActivityRecord);
}
