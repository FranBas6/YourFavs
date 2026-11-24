/**
 * Cuántos votos de TMDB hacen falta para fiarse de una nota (QA 8.1, H21/H46; umbrales decididos por
 * Fran el 2026-11-24). Un 9,1 con 400 votos no es un «top» ni un 10,0 con 3 votos dice nada.
 */

/** «Top películas» y «Top series»: ordenadas por nota, solo con estos votos o más. */
export const TOP_MIN_VOTES = { movie: 5000, tv: 2000 } as const;

/** Por debajo de esto, las tarjetas no enseñan la nota de TMDB. */
export const CARD_RATING_MIN_VOTES = 50;

/** ¿Se enseña la nota de TMDB? Sin `vote_count` (datos viejos o de otra fuente) se enseña, como antes. */
export function showsTmdbRating(voteAverage: number | null | undefined, voteCount: number | null | undefined): boolean {
    if (!voteAverage || voteAverage <= 0) return false;
    return voteCount == null || voteCount >= CARD_RATING_MIN_VOTES;
}
