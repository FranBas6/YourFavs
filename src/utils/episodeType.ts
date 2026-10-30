/**
 * Texto para el `episode_type` de TMDB fuera de la ficha (B2b, 2026-10-29): calendario, campana,
 * cuenta atrás de Siguiendo, Radar y «Hoy en tu cine». En la ficha de serie hay además «FINAL DE
 * SERIE» (`serie/[id].astro::episodeMark`), que necesita saber que es la última temporada de una
 * serie terminada; aquí no se sabe, así que solo se distingue final de temporada y parón.
 *
 * TMDB: «standard» (lo normal), «finale» (último de la temporada), «mid_season» (la temporada para
 * a mitad y sigue más adelante). No es un spoiler: dice dónde acaba la temporada, como el número de
 * episodios.
 */
export function episodeTypeLabel(episodeType: string | null | undefined): string | null {
    if (episodeType === 'finale') return 'final de temporada';
    if (episodeType === 'mid_season') return 'parón de mitad de temporada';
    return null;
}

/** Versión corta en mayúsculas para etiquetas pequeñas («FINAL», «PARÓN»). */
export function episodeTypeTag(episodeType: string | null | undefined): string | null {
    if (episodeType === 'finale') return 'FINAL';
    if (episodeType === 'mid_season') return 'PARÓN';
    return null;
}
