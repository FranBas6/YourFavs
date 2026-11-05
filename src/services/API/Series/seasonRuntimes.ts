/**
 * Duración de cada episodio de una temporada (minutos), para el «tiempo en pantalla» de Actividad.
 *
 * `/tv/{id}/season/{n}` trae el `runtime` de todos los episodios de la temporada en UNA llamada, así
 * que se pide una vez por temporada distinta, no por episodio. Caché L1 por instancia (24 h: la
 * duración de un episodio emitido no cambia). Con muchas temporadas en juego (un maratón marcado
 * en bloque de 20+ temporadas), se piden como mucho `max` y el resto lo estima quien llama con la
 * duración media de la serie.
 */
import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';

const TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: Record<number, number> | null; expires: number }>();

export const seasonKey = (serieId: string | number, season: number) => `${serieId}:${season}`;

/** Mapa `serieId:temporada → { nº de episodio: minutos }` con las temporadas que TMDB haya podido dar. */
export async function getSeasonRuntimes(
    pairs: { id: string | number; season: number }[],
    max = 20,
): Promise<Map<string, Record<number, number>>> {
    const out = new Map<string, Record<number, number>>();
    const todo: { id: string | number; season: number; key: string }[] = [];
    const seen = new Set<string>();
    for (const p of pairs) {
        const key = seasonKey(p.id, p.season);
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) { if (hit.data) out.set(key, hit.data); continue; }
        todo.push({ ...p, key });
    }
    await processBatch(todo.slice(0, max), async (p) => {
        try {
            const data = await tmdbFetch<{ episodes?: { episode_number: number; runtime?: number | null }[] }>(`/tv/${p.id}/season/${p.season}`);
            const rec: Record<number, number> = {};
            for (const e of data.episodes ?? []) if (Number(e.runtime) > 0) rec[e.episode_number] = Number(e.runtime);
            cache.set(p.key, { data: rec, expires: Date.now() + TTL_MS });
            out.set(p.key, rec);
        } catch {
            cache.set(p.key, { data: null, expires: Date.now() + FAIL_TTL_MS });
        }
        return null;
    }, 6);
    return out;
}
