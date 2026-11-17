/**
 * Desde cuándo te espera una serie (Fran, 2026-11-16): lo usan «¿Retomamos alguna?» de la portada
 * (`stalledSeries.ts`, 4 semanas) y «Series abandonadas» de Siguiendo (6 meses). Pura, sin base de datos.
 *
 * Ir al día esperando episodios nuevos no es dejarla a medias (quien llama no pasa `next`), y una
 * temporada que salió ayer no lleva meses esperando: el reloj empieza en lo último de dos fechas, tu
 * último visionado o la emisión del primer episodio que te falta.
 */

/** «hace 5 días» · «hace 6 semanas» · «hace 8 meses» · «hace 2 años». */
export function agoLabel(ts: number, now = Date.now()): string {
    const days = Math.max(0, Math.floor((now - ts) / (24 * 60 * 60 * 1000)));
    if (days < 14) return days === 1 ? 'hace 1 día' : `hace ${days} días`;
    if (days < 56) return `hace ${Math.round(days / 7)} semanas`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} meses`;
    const years = Math.floor(months / 12);
    return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

/**
 * Desde cuándo te espera una serie y por qué, a partir de tu último visionado y del primer episodio
 * emitido que te falta (`next`, de `computeNextEpisode`; sin él vas al día y no te espera nada):
 *   · salió después de tu último visionado → «T3 disponible desde hace 8 meses» (o «episodios nuevos…»
 *     si es uno suelto de una temporada que ya estabas viendo); el reloj empieza en su emisión;
 *   · ya estaba cuando lo dejaste → «sin ver nada desde hace 2 años»; el reloj, en tu último visionado.
 */
export function resumeReason(
    lastWatchedAt: number,
    next: { next_season: number; next_episode: number; air_date: string | null },
    now = Date.now(),
): { since: number; label: string } {
    const aired = next.air_date ? Date.parse(`${next.air_date}T12:00:00Z`) : 0;
    if (aired > lastWatchedAt) {
        const what = next.next_episode === 1 ? `T${next.next_season} disponible` : 'Episodios nuevos';
        return { since: aired, label: `${what} desde ${agoLabel(aired, now)}` };
    }
    return { since: lastWatchedAt, label: `Sin ver nada desde ${agoLabel(lastWatchedAt, now)}` };
}
