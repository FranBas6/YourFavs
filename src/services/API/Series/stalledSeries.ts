/**
 * "Rescatar series a medias" (§1) — series EN SEGUIMIENTO con episodios emitidos sin ver que llevan
 * tiempo esperándote (>4 semanas). Alimenta el bloque "¿Retomamos alguna?" de la Home; la misma regla
 * (`resumeReason`, con 6 meses) decide las «Series abandonadas» de Siguiendo.
 *
 * Qué cuenta (Fran, 2026-11-16): ir al día y esperar episodios nuevos NO es dejarla a medias; y una
 * temporada que salió ayer no lleva meses esperando. El reloj empieza en lo último de dos fechas: tu
 * último visionado o la emisión del primer episodio que te falta.
 *
 * Coste: base de datos (Siguiendo + progreso, en lote) + para cada candidato inactivo (pocos), su
 * detalle y la temporada del hueco en TMDB (`computeNextEpisode`), para saber qué te toca y desde cuándo.
 * Al abandonar (§1.1) la serie sale de Siguiendo → deja de aparecer aquí automáticamente.
 */
import { getSeriesSiguiendo, getWatchedProgress, getWatchedProgressBatch } from '../../BD/series/yourfavsSerie';
import { fetchSerieDetails } from './tmdbSeries';
import { computeNextEpisode } from './nextEpisode';
import { episodeHref } from '../../../utils/episodeView';
import { resumeReason } from '../../../utils/resumeReason';
import { getCurrentUid } from '../../BD/shared/userScope';
import { processBatch } from '../../../utils/processBatch';

export interface StalledSerie {
    id: string;
    name: string;
    poster_path: string | null;
    watched: number;
    /** La temporada que te toca (la del primer episodio emitido sin ver). */
    lastSeason: number;
    lastWatchedAt: number;
    /** Desde cuándo te espera algo (ver `resumeReason`). */
    since: number;
    label: string;           // "T3 disponible desde hace 8 meses" / "sin ver nada desde hace 2 años"
    /** Ficha del episodio que te toca. */
    resumeHref: string;
}

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

export async function getStalledSeries(max = 8, cutoffMs = FOUR_WEEKS_MS): Promise<StalledSerie[]> {
    if (!getCurrentUid()) return [];
    const following = await getSeriesSiguiendo();
    if (!following.length) return [];

    const progress = await getWatchedProgressBatch(following.map((s: any) => String(s.id)));
    const cutoff = Date.now() - cutoffMs;
    const candidates = following.filter((s: any) => {
        const w = progress[String(s.id)];
        return !!(w && w.watched > 0 && w.lastWatchedAt && w.lastWatchedAt < cutoff);
    });
    if (!candidates.length) return [];

    // Detalle TMDB, progreso completo y siguiente episodio SOLO de los candidatos inactivos (pocos).
    const resolved = await processBatch(
        candidates.map((s: any) => String(s.id)),
        async (id: string) => {
            try {
                const [d, full] = await Promise.all([fetchSerieDetails(id), getWatchedProgress(id)]);
                if (!d || !full) return null;
                return { d, next: await computeNextEpisode(id, d, full) };
            } catch {
                return null;
            }
        },
        8,
    );

    const out: StalledSerie[] = [];
    for (let i = 0; i < candidates.length; i++) {
        const r = resolved[i];
        // Sin siguiente emitido: vas al día (o no hay nada emitido pendiente) → no te espera nada.
        if (!r?.next) continue;
        const { d, next } = r;
        const w = progress[String(candidates[i].id)]!;
        // "A un paso de terminar" (1 o 2 episodios, como en Siguiendo) → eso es rematar, no rescatar.
        if (d.number_of_episodes && w.watched >= d.number_of_episodes - 2) continue;
        const why = resumeReason(w.lastWatchedAt!, next);
        if (why.since >= cutoff) continue; // lo nuevo salió hace poco: aún no lleva tiempo esperando
        out.push({
            id: String(d.id),
            name: d.name,
            poster_path: d.poster_path ?? null,
            watched: w.watched,
            lastSeason: next.next_season,
            lastWatchedAt: w.lastWatchedAt!,
            since: why.since,
            label: why.label,
            resumeHref: episodeHref(d.id, next.next_season, next.next_episode),
        });
    }
    return out.sort((a, b) => a.since - b.since).slice(0, max);
}
