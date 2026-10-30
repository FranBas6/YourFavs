/**
 * La lógica PURA del ranking semanal: la clave del documento y el cálculo del movimiento.
 *
 * Vive aparte de `services/API/shared/weeklyRanking.ts` a propósito: ese módulo habla con la base de
 * datos (`app_state`) y con TMDB, y arrastrarlo solo para calcular un delta haría que nada de esto se
 * pudiera probar sin credenciales. Aquí no hay más dependencias que los tipos.
 */

export interface RankingItem {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    /**
     * Se guarda aunque el tratamiento A (cinta numerada) no lo use: es lo que necesita el tratamiento
     * «podio», y así verlo después es añadir un componente, sin volver a tocar datos ni cálculo.
     */
    backdropPath: string | null;
    year: string;
    popularity: number;
    /** Plataformas del usuario en las que está, de las consultadas. */
    providers: number[];
}

/** Lo que pinta la fila: el puesto y cuánto se ha movido. */
export interface RankedEntry extends RankingItem {
    rank: number;
    /** `null` = no hay semana anterior con la que comparar (la primera semana no miente con NUEVA). */
    move: number | null | 'new';
}

/** Tope de plataformas por consulta: acota el coste si alguien añade media región. */
export const MAX_RANKING_PROVIDERS = 12;

/** Una peli y una serie pueden compartir id en TMDB, así que el tipo entra en la clave. */
const itemKey = (it: { mediaType: string; id: number }) => `${it.mediaType}:${it.id}`;

export function normalizeRankingPlatforms(platforms: number[]): number[] {
    return [...new Set((platforms || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
        .sort((a, b) => a - b)
        .slice(0, MAX_RANKING_PROVIDERS);
}

/**
 * Clave del documento: región + plataformas ORDENADAS. Legible a propósito
 * (`rank_ES_8-119-337-1899`) en vez de un hash opaco: se puede auditar de un vistazo, y agrupa a quien
 * comparta configuración, que es de lo que se trata.
 */
export function rankingDocId(region: string, platforms: number[]): string {
    const ids = normalizeRankingPlatforms(platforms);
    return `rank_${region}_${ids.length ? ids.join('-') : 'all'}`;
}

/**
 * Añade el movimiento comparando con la semana anterior. **La primera semana no lleva indicadores**: sin
 * referencia, marcar los diez como NUEVA sería una mentira de bienvenida.
 */
export function withMovement(items: RankingItem[], prevItems?: RankingItem[]): RankedEntry[] {
    const hasPrev = Array.isArray(prevItems) && prevItems.length > 0;
    const prevRank = new Map<string, number>();
    if (hasPrev) prevItems!.forEach((it, i) => prevRank.set(itemKey(it), i));

    return items.map((it, i) => {
        if (!hasPrev) return { ...it, rank: i + 1, move: null };
        const before = prevRank.get(itemKey(it));
        if (before === undefined) return { ...it, rank: i + 1, move: 'new' as const };
        return { ...it, rank: i + 1, move: before - i };
    });
}
