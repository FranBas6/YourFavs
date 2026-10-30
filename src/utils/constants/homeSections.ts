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
    /**
     * Nace APAGADO: el usuario lo enciende desde Ajustes si le interesa. Para bloques que no todo el
     * mundo quiere — quien ya tiene «Tendencias» y «Más populares» no necesita una tercera fila de lo
     * mismo, y meterle contenido que no ha pedido es justo lo contrario de «Tu Home».
     *
     * Ojo: el modelo asumía «clave ausente del layout guardado = visible». Esto lo cambia, y hay que
     * respetarlo en los CUATRO sitios que deciden visibilidad: aquí (`hiddenHomeKeys`), el endpoint
     * `api/profile/home-layout`, el POST sin JS de `perfil/[...seccion].astro` y el recuento de
     * `SettingsNav`. Si uno se queda atrás, el bloque se enciende solo.
     */
    defaultHidden?: boolean;
}

export const HOME_SECTIONS: HomeSectionDef[] = [
    { key: 'estas-viendo', label: 'Estás viendo', desc: 'Pelis empezadas y series con episodios pendientes.' },
    { key: 'rescatar', label: '¿Retomamos alguna?', desc: 'Series que dejaste a medias hace más de un mes.' },
    { key: 'para-ti', label: 'Para ti', desc: 'Recomendaciones a partir de tus gustos y favoritos.' },
    { key: 'que-veo', label: '¿Qué veo?', desc: 'La ruleta: compañía, tiempo y ánimo → un plan.' },
    { key: 'engancha', label: 'Enganchan desde el primer episodio', desc: 'Series cuyo piloto está mejor valorado que la propia serie.' },
    { key: 'tendencias', label: 'Tendencias de la semana', desc: 'Lo que está viendo todo el mundo ahora.' },
    { key: 'lanzamientos', label: 'Últimos lanzamientos', desc: 'Estrenos recientes en cine y plataformas.' },
    { key: 'nuevo-streaming', label: 'Nuevo en streaming', desc: 'Películas recién llegadas a digital en tu país y series nuevas con episodio esta semana.' },
    { key: 'populares', label: 'Más populares', desc: 'Los títulos con más tirón de forma sostenida.' },
    { key: 'top-pelis', label: 'Top películas', desc: 'Las mejor valoradas de la historia.' },
    { key: 'top-series', label: 'Top series', desc: 'Las series mejor valoradas de la historia.' },
    { key: 'plataforma', label: 'Plataforma destacada', desc: 'Una plataforma distinta cada vez, con su catálogo.' },
    { key: 'categoria', label: 'Categoría destacada', desc: 'Un género rotatorio para picotear.' },
    {
        key: 'popular-region',
        label: 'Lo más popular esta semana',
        desc: 'Top 10 de tu región entre tus plataformas, con lo que ha subido o bajado.',
        // Apagado: quien ya tiene Tendencias y Más populares no necesita una tercera fila de lo mismo.
        defaultHidden: true,
    },
    {
        key: 'social',
        label: 'Lo que ven tus amigos',
        desc: 'Lo que han visto esta semana tus amigos y las personas que sigues.',
        // Apagado: solo tiene sentido con gente a la que sigues, y la portada no se llena sola de caras.
        defaultHidden: true,
    },
];

export type HomeLayoutPref = { key: string; hidden?: boolean };

/**
 * Set de claves OCULTAS. Una clave presente en la preferencia manda (la eligió el usuario); una clave
 * AUSENTE cae a su `defaultHidden`, que es como los bloques nuevos pueden nacer apagados.
 */
export function hiddenHomeKeys(layout?: HomeLayoutPref[] | null): Set<string> {
    const saved = new Map((layout || []).filter((s) => s?.key).map((s) => [s.key, s.hidden === true]));
    const hidden = new Set<string>();
    for (const def of HOME_SECTIONS) {
        const explicit = saved.get(def.key);
        if (explicit === undefined ? def.defaultHidden === true : explicit) hidden.add(def.key);
    }
    // Claves guardadas que ya no existen en HOME_SECTIONS: si estaban ocultas, siguen ocultas.
    for (const [key, isHidden] of saved) if (isHidden) hidden.add(key);
    return hidden;
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
