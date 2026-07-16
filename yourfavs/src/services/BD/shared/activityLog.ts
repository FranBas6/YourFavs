/**
 * Bitácora de acciones intencionales (§5) — `Activity` append-only.
 *
 *   users/{uid}/Activity/{entryId}   // id autogenerado
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
import { userCol, getCurrentUid } from './userScope';

const COLLECTION = 'Activity';

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
    if (!getCurrentUid()) return;
    const tmdbId = Number(e.tmdb_id);
    if (!Number.isFinite(tmdbId)) return;

    const doc: Record<string, unknown> = {
        verb: e.verb,
        media_type: e.media_type,
        tmdb_id: tmdbId,
        logged_at: new Date(),
    };
    if (e.meta && Object.keys(e.meta).length) doc.meta = e.meta;

    await userCol(COLLECTION).add(doc);
}

/** Todas las entradas de la bitácora (el feed las ordena/mezcla con el resto de fuentes). */
export async function listActivity(): Promise<ActivityRecord[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).get();
    return snap.docs.map((d) => {
        const x = d.data() as Omit<ActivityRecord, 'id'>;
        return { id: d.id, ...x };
    });
}
