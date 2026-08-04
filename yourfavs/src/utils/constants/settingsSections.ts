/**
 * Secciones del panel de Ajustes (`/perfil/[seccion]`) — handoff `design_handoff_ajustes`.
 *
 * Fuente única para la ruta (qué sección es válida) y para `SettingsNav` (qué se pinta y en qué
 * grupo). Añadir una sección = añadir una entrada aquí + su `Seccion*.astro`.
 *
 * `key` viaja en la URL y en el campo oculto `section` de cada formulario, que es lo que hace que
 * un POST solo escriba SUS campos: el formulario único anterior reescribía plataformas, campana,
 * spoilers y homeLayout en cada guardado, así que enviar "Contenido" podía vaciar lo demás.
 */
export const SETTINGS_GROUPS = [
    { key: 'perfil', label: 'Tu perfil' },
    { key: 'experiencia', label: 'Tu experiencia' },
    { key: 'cuenta', label: 'Cuenta' },
] as const;

export type SettingsGroupKey = (typeof SETTINGS_GROUPS)[number]['key'];

export interface SettingsSectionDef {
    /** Segmento de URL y valor del campo `section` en los formularios. */
    key: string;
    /** Texto en la navegación lateral / índice móvil. */
    label: string;
    /** `h1` de la sección (27px/600 según el handoff). */
    title: string;
    /** Párrafo bajo el `h1`. */
    description: string;
    group: SettingsGroupKey;
    /** Nombre del icono; el SVG lo pinta `SettingsNav.astro`. */
    icon: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
    {
        key: 'perfil', label: 'Perfil', group: 'perfil', icon: 'user',
        title: 'Perfil',
        description: 'Tu avatar y el nombre con el que te ve la app.',
    },
    {
        key: 'gustos', label: 'Tus gustos', group: 'perfil', icon: 'heart',
        title: 'Tus gustos',
        description: 'Lo que usamos para personalizar tus recomendaciones «Para ti».',
    },
    {
        key: 'home', label: 'Tu Home', group: 'experiencia', icon: 'layout',
        title: 'Tu Home',
        description: 'Ordena los bloques de la portada y apaga los que no uses. El hero de arriba se queda fijo.',
    },
    {
        key: 'plataformas', label: 'Plataformas', group: 'experiencia', icon: 'tv',
        title: 'Plataformas',
        description: 'Dónde puedes ver las cosas. Afina el catálogo, la ruleta y el «dónde ver» de cada ficha.',
    },
    {
        key: 'notificaciones', label: 'Notificaciones', group: 'experiencia', icon: 'bell',
        title: 'Notificaciones',
        description: 'Qué te avisa la campana.',
    },
    {
        key: 'contenido', label: 'Contenido y región', group: 'experiencia', icon: 'globe',
        title: 'Contenido y región',
        description: 'De dónde salen las plataformas y en qué idioma llegan sinopsis y títulos.',
    },
    {
        key: 'apariencia', label: 'Apariencia', group: 'experiencia', icon: 'palette',
        title: 'Apariencia',
        description: 'Claro, oscuro o lo que diga tu sistema.',
    },
    {
        key: 'calendario', label: 'Calendario', group: 'cuenta', icon: 'calendar',
        title: 'Suscripción al calendario',
        description: 'Lleva tus estrenos a tu app de calendario de siempre.',
    },
    {
        key: 'cuenta', label: 'Cuenta y datos', group: 'cuenta', icon: 'shield',
        title: 'Cuenta y datos',
        description: 'Tu sesión y las opciones que no se pueden deshacer.',
    },
];

export const SETTINGS_SECTION_KEYS = SETTINGS_SECTIONS.map((s) => s.key);

/** Sección que se muestra en `/perfil` a secas (y en escritorio, la que abre el panel). */
export const DEFAULT_SETTINGS_SECTION = 'perfil';

export function findSettingsSection(key: string | undefined): SettingsSectionDef | null {
    if (!key) return null;
    return SETTINGS_SECTIONS.find((s) => s.key === key) ?? null;
}
