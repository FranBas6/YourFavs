/**
 * "Rescatar series a medias" (§1) — series EN SEGUIMIENTO con progreso pero inactivas
 * (>4 semanas sin marcar un episodio). Alimenta el bloque "¿Retomamos alguna?" de la Home.
 *
 * Coste: Firestore (Siguiendo + progreso por serie) + 1 fetch TMDB SOLO por candidato
 * inactivo (que son pocos), para nombre/póster y descartar las "a un paso de terminar".
 * Al abandonar (§1.1) la serie sale de Siguiendo → deja de aparecer aquí automáticamente.
 */
import { getSeriesSiguiendo, getWatchedProgressBatch } from '../../BD/series/yourfavsSerie';
import { fetchSerieDetails } from './tmdbSeries';
import { getCurrentUid } from '../../BD/shared/userScope';
import { processBatch } from '../../../utils/processBatch';

export interface StalledSerie {
    id: string;
    name: string;
    poster_path: string | null;
    watched: number;
    lastSeason: number;
    lastWatchedAt: number;
    label: string;           // "hace 6 semanas" / "hace 2 meses"
}

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

function agoLabel(ts: number): string {
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (days < 56) return `hace ${Math.max(4, Math.round(days / 7))} semanas`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} meses`;
    const years = Math.floor(months / 12);
    return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

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

    // Detalles TMDB SOLO de los candidatos inactivos (pocos).
    const details = await processBatch(
        candidates.map((s: any) => String(s.id)),
        (id: string) => fetchSerieDetails(id).catch(() => null),
        8,
    );

    const out: StalledSerie[] = [];
    for (let i = 0; i < candidates.length; i++) {
        const d = details[i];
        if (!d) continue;
        const w = progress[String(candidates[i].id)]!;
        // "A un paso de terminar" → eso es rematar, no rescatar: fuera del aviso.
        if (d.number_of_episodes && w.watched >= d.number_of_episodes - 1) continue;
        const seasons = Object.keys(w.bySeasons || {}).map(Number);
        out.push({
            id: String(d.id),
            name: d.name,
            poster_path: d.poster_path ?? null,
            watched: w.watched,
            lastSeason: seasons.length ? Math.max(...seasons) : 1,
            lastWatchedAt: w.lastWatchedAt!,
            label: agoLabel(w.lastWatchedAt!),
        });
    }
    return out.sort((a, b) => a.lastWatchedAt - b.lastWatchedAt).slice(0, max);
}
