/**
 * Visionados de episodios, unificando las DOS colecciones que los guardan.
 *
 *   `WatchedEpisodes`  users/{uid}/WatchedEpisodes/{serieId} → array `watched_episodes[]`
 *                      Es el PROGRESO: qué llevas visto AHORA. `watched_at` es el instante
 *                      real del último marcado de cada episodio. Vaciar el progreso para
 *                      volver a ver una serie (`unmarkAllWatched`) BORRA el documento.
 *   `WatchLog`         users/{uid}/WatchLog/{entryId} → una fila por marcado, append-only.
 *                      Sobrevive al vaciado, así que es la única memoria de los pases
 *                      anteriores.
 *
 * La dedupe es por (serie, temporada, episodio, **DÍA**), no por (serie, temporada,
 * episodio): un episodio visto dos veces en fechas distintas son DOS visionados. El feed
 * de Actividad deduplica por episodio a secas (`activityFeed.ts`) porque solo le interesa
 * el progreso actual y no quiere repetir filas; aquí haría lo contrario de lo que hace
 * falta — un revisionado completo re-marca las mismas claves y se comería el pase
 * original entero, que es justo el historial que queremos pintar.
 */
import { getFirebaseTimestamp } from '../../../utils/constants/helpers/media-helpers';
import { appDateParts } from '../../../utils/appTime';

export interface EpisodeWatch {
    serieId: string;
    season: number;
    episode: number;
    /** Instante del visionado. Si la hora no es fiable, mediodía UTC de su día. */
    ts: number;
    /** `true` = del backfill: el día es bueno, la hora es inventada. */
    synthetic: boolean;
}

/** Fila de `WatchLog` tal y como se lee (los campos son opcionales por histórico). */
export interface WatchLogRow {
    media_type?: string;
    tmdb_id?: number;
    season?: number;
    episode?: number;
    watched_on?: string;
    rewatch?: boolean;
    logged_at?: unknown;
    source?: string;
}

/**
 * Instante de una fila del diario: `logged_at` si es un marcado real, y si viene del
 * backfill (o no tiene hora), mediodía UTC de su `watched_on` — así ninguna zona horaria
 * puede moverle el día. Misma regla que usa el feed de Actividad.
 */
export function watchLogInstant(x: WatchLogRow): { ts: number; synthetic: boolean } {
    const loggedMs = getFirebaseTimestamp(x.logged_at);
    const realHour = Boolean(loggedMs) && x.source !== 'backfill';
    if (realHour) return { ts: loggedMs, synthetic: false };
    const ts = x.watched_on ? new Date(x.watched_on + 'T12:00:00Z').getTime() : loggedMs;
    return { ts, synthetic: true };
}

/** Progreso de una serie tal y como lo devuelve `getAllWatchedProgress`. */
export interface LiveProgress {
    id: string;
    watched_episodes?: { season: number; episode: number; watched_at?: string }[];
}

/**
 * Un array plano de visionados a partir de las dos fuentes (que el llamante ya tiene
 * leídas: aquí no se toca la BD).
 *
 * El orden importa: `WatchedEpisodes` va primero para que, cuando las dos fuentes
 * describan el mismo episodio el mismo día, gane la hora real del progreso sobre la
 * posible hora sintética del diario.
 */
export function unionEpisodeWatches(
    live: LiveProgress[],
    logRows: WatchLogRow[],
): EpisodeWatch[] {
    const out: EpisodeWatch[] = [];
    const seen = new Set<string>();

    const push = (serieId: string, season: number, episode: number, ts: number, synthetic: boolean) => {
        if (!ts || isNaN(ts)) return;
        const key = `${serieId}:${season}:${episode}:${appDateParts(ts).key}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ serieId, season, episode, ts, synthetic });
    };

    for (const data of live) {
        const serieId = data.id;
        for (const ep of data.watched_episodes || []) {
            if (!ep.watched_at) continue;
            push(serieId, ep.season, ep.episode, new Date(ep.watched_at).getTime(), false);
        }
    }

    for (const x of logRows) {
        if (x.media_type !== 'tv' || x.season == null || x.episode == null) continue;
        const { ts, synthetic } = watchLogInstant(x);
        push(String(x.tmdb_id), x.season, x.episode, ts, synthetic);
    }

    return out;
}
