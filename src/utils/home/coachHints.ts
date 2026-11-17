/**
 * Coach — pistas contextuales que se muestran UNA vez por usuario (§3 "cuidar").
 *
 * REGLA: texto FIJO, escrito una vez. Cero mantenimiento, cero datos nuevos. Cada
 * hint aparece la primera vez que el usuario (con sesión) visita una ruta que casa
 * con alguno de sus `paths` (match por prefijo), y NO vuelve (flag localStorage
 * `yf_coach_<id>`). No pisa la pista de gustos: si esa es elegible, sale antes.
 *
 * CURAR AQUÍ: añade/edita hints libremente. Solo apunta a features que EXISTEN de
 * verdad (p.ej. la "búsqueda avanzada por actores" fue retirada → no la anuncies).
 * El orden importa: si varias casan con la ruta, se muestra la primera no descartada.
 */
export interface CoachHint {
    id: string;            // clave de localStorage: yf_coach_<id> (kebab-case)
    paths: string[];       // prefijos de ruta donde aplica (match por startsWith/igualdad)
    icon: string;          // emoji para el chip
    title: string;         // titular corto
    text: string;          // cuerpo (frase única)
    ctaLabel?: string;     // texto del enlace (opcional)
    ctaHref?: string;      // destino del enlace (opcional)
}

export const COACH_HINTS: CoachHint[] = [
    {
        id: 'ruleta',
        paths: ['/mislistas/pendientes'],
        icon: '🎲',
        title: '¿No sabes qué ver?',
        text: 'Prueba la ruleta «¿Qué veo?» y deja que elija por ti según tu tiempo y tu ánimo.',
    },
    {
        id: 'seguir-actor',
        paths: ['/actor'],
        icon: '🔔',
        title: 'Avísame de estrenos',
        text: 'Sigue a un actor o director y te avisamos cuando estrene algo nuevo.',
    },
    {
        id: 'identidad',
        paths: ['/mislistas/actividad'],
        icon: '🎭',
        title: 'Tu cine en números',
        text: 'Descubre tu arquetipo cinéfilo y tu ADN por género.',
        ctaLabel: 'Ver mi identidad →',
        ctaHref: '/mislistas/year/siempre',
    },
];
