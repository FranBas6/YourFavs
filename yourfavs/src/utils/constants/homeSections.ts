/**
 * Bloques configurables de la Home (§4 "Home a tu medida"). El usuario elige cuáles ver
 * (y, más adelante, en qué orden) desde /perfil → se guarda en `UserProfile.homeLayout`.
 * El HERO (brief/trending) queda fijo arriba y NO entra aquí.
 */
export interface HomeSectionDef { key: string; label: string; }

export const HOME_SECTIONS: HomeSectionDef[] = [
    { key: 'estas-viendo', label: 'Estás viendo' },
    { key: 'rescatar',     label: '¿Retomamos alguna? (series a medias)' },
    { key: 'para-ti',      label: 'Para ti (recomendaciones)' },
    { key: 'que-veo',      label: '¿Qué veo? (ruleta)' },
    { key: 'tendencias',   label: 'Tendencias de la semana' },
    { key: 'lanzamientos', label: 'Últimos lanzamientos' },
    { key: 'populares',    label: 'Más populares' },
    { key: 'top-pelis',    label: 'Top películas' },
    { key: 'top-series',   label: 'Top series' },
    { key: 'plataforma',   label: 'Plataforma destacada' },
    { key: 'categoria',    label: 'Categoría destacada' },
];

export type HomeLayoutPref = { key: string; hidden?: boolean };

/** Set de claves OCULTAS a partir de la preferencia guardada (vacío = todo visible). */
export function hiddenHomeKeys(layout?: HomeLayoutPref[] | null): Set<string> {
    return new Set((layout || []).filter((s) => s && s.hidden).map((s) => s.key));
}
