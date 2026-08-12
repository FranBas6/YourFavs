/**
 * Bloques configurables de la Home (§4 "Home a tu medida"). El usuario elige cuáles ver y en
 * qué orden desde Ajustes → se guarda en `UserProfile.homeLayout`, cuyo ORDEN de array es el
 * orden real de la portada (`index.astro` lo recorre tal cual).
 *
 * El HERO (brief/trending) queda fijo arriba y NO entra aquí.
 */
export interface HomeSectionDef {
    key: string;
    label: string;
    /** Una línea de qué es ese bloque, para reconocerlo sin abrir la portada. */
    desc: string;
}

export const HOME_SECTIONS: HomeSectionDef[] = [
    { key: 'estas-viendo', label: 'Estás viendo', desc: 'Pelis empezadas y series con episodios pendientes.' },
    { key: 'rescatar', label: '¿Retomamos alguna?', desc: 'Series que dejaste a medias hace más de un mes.' },
    { key: 'para-ti', label: 'Para ti', desc: 'Recomendaciones a partir de tus gustos y favoritos.' },
    { key: 'que-veo', label: '¿Qué veo?', desc: 'La ruleta: compañía, tiempo y ánimo → un plan.' },
    { key: 'engancha', label: 'Enganchan desde el primer episodio', desc: 'Series cuyo piloto está mejor valorado que la propia serie.' },
    { key: 'tendencias', label: 'Tendencias de la semana', desc: 'Lo que está viendo todo el mundo ahora.' },
    { key: 'lanzamientos', label: 'Últimos lanzamientos', desc: 'Estrenos recientes en cine y plataformas.' },
    { key: 'populares', label: 'Más populares', desc: 'Los títulos con más tirón de forma sostenida.' },
    { key: 'top-pelis', label: 'Top películas', desc: 'Las mejor valoradas de la historia.' },
    { key: 'top-series', label: 'Top series', desc: 'Las series mejor valoradas de la historia.' },
    { key: 'plataforma', label: 'Plataforma destacada', desc: 'Una plataforma distinta cada vez, con su catálogo.' },
    { key: 'categoria', label: 'Categoría destacada', desc: 'Un género rotatorio para picotear.' },
];

export type HomeLayoutPref = { key: string; hidden?: boolean };

/** Set de claves OCULTAS a partir de la preferencia guardada (vacío = todo visible). */
export function hiddenHomeKeys(layout?: HomeLayoutPref[] | null): Set<string> {
    return new Set((layout || []).filter((s) => s && s.hidden).map((s) => s.key));
}

/**
 * Filas en el orden en que hay que pintarlas en Ajustes: primero el orden guardado (descartando
 * claves que ya no existen), luego los bloques nuevos añadidos después de que el usuario
 * guardara, y al final las ocultas — que NO desaparecen de la lista, bajan.
 */
export function homeRowsFor(layout?: HomeLayoutPref[] | null): { key: string; label: string; desc: string; hidden: boolean }[] {
    const saved = (layout || []).map((x) => x.key).filter((k) => HOME_SECTIONS.some((s) => s.key === k));
    const order = [...saved, ...HOME_SECTIONS.filter((s) => !saved.includes(s.key)).map((s) => s.key)];
    const hidden = hiddenHomeKeys(layout);

    const rows = order.map((key) => {
        const def = HOME_SECTIONS.find((s) => s.key === key)!;
        return { key, label: def.label, desc: def.desc, hidden: hidden.has(key) };
    });
    // Estables: visibles arriba en su orden, ocultas debajo en el suyo.
    return [...rows.filter((r) => !r.hidden), ...rows.filter((r) => r.hidden)];
}
