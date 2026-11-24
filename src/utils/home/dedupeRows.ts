/**
 * Portada sin títulos repetidos entre filas (QA 8.2, H23; decisión de Fran: gana la fila de más arriba).
 *
 * Se recorre la portada en el orden en que se pinta («Tu Home»). Cada título cuenta solo en la PRIMERA
 * fila donde se ve; las filas de catálogo de más abajo lo saltan y tiran de su siguiente resultado. Las
 * filas tuyas (Estás viendo, Para ti, ¿Retomamos?, Engancha…) no se filtran, pero sus títulos sí cuentan
 * como vistos para las de abajo.
 */
export type MediaKind = 'movie' | 'tv';
export type TitleRef = { kind: MediaKind; id: number | string };

/** Una fila de catálogo de la portada: lo que se filtra. */
export interface DedupableRow {
    movies: { id: number | string }[];
    series: { id: number | string }[];
}

export interface DedupeStep {
    key: string;
    /** Fila de catálogo que se filtra (se reemplazan sus `movies`/`series`). */
    row?: DedupableRow;
    /** Títulos que esta sección enseña sin filtrarse (filas personales). */
    fixed?: TitleRef[];
}

/**
 * @param steps  la portada en el orden de pintado.
 * @param seed   lo que ya se ve antes de las filas (el cartel de Tendencias, si es la portada visible).
 * @param visiblePerKind cuántas películas y cuántas series pinta una fila de catálogo (las demás no cuentan).
 */
export function dedupeHomeRows(steps: DedupeStep[], seed: TitleRef[] = [], visiblePerKind = 10): void {
    const shown = new Set<string>(seed.map((t) => `${t.kind}:${t.id}`));
    const mark = (kind: MediaKind, id: number | string) => shown.add(`${kind}:${id}`);
    for (const step of steps) {
        for (const t of step.fixed ?? []) mark(t.kind, t.id);
        if (!step.row) continue;
        step.row.movies = step.row.movies.filter((m) => !shown.has(`movie:${m.id}`));
        step.row.series = step.row.series.filter((s) => !shown.has(`tv:${s.id}`));
        step.row.movies.slice(0, visiblePerKind).forEach((m) => mark('movie', m.id));
        step.row.series.slice(0, visiblePerKind).forEach((s) => mark('tv', s.id));
    }
}
