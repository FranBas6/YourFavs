/**
 * Iconos de las filas de ajustes. SVG en línea, viewBox 24, `stroke-width: 1.7`, sin relleno
 * y heredando color — la spec del handoff. Cada entrada es una lista de `d` (algunos icono
 * necesitan varios trazos).
 *
 * Están aquí y no como componentes por icono para que una fila se declare con un string
 * (`icon="bell"`) en vez de con markup.
 */
export const SETTING_ICONS: Record<string, string[]> = {
    tv: ['M2 7h20v12H2z', 'm7 3 5 4 5-4'],
    layers: ['m12 2 9 5-9 5-9-5 9-5', 'm3 12 9 5 9-5', 'm3 17 9 5 9-5'],
    userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M19 8v6M22 11h-6'],
    zap: ['M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
    history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4', 'M12 8v4l3 2'],
    flame: ['M12 22c4 0 7-2.7 7-6.5 0-4.5-5-6.5-4-11.5-3 1-6 4.5-6 8 0-1.5-1-3-2-3.5-.7 1.5-2 3.5-2 7C5 19.3 8 22 12 22z'],
    calendarDays: ['M3 5h18v16H3z', 'M3 10h18M8 3v4M16 3v4', 'M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01'],
    megaphone: ['m3 11 15-6v14L3 13z', 'M3 11v2a2 2 0 0 0 2 2h1v4h3v-4'],
    mail: ['M3 6h18v12H3z', 'm3 7 9 6 9-6'],
    image: ['M3 4h18v16H3z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'm21 16-5-5L5 20'],
    text: ['M4 6h16M4 11h16M4 16h10'],
    filter: ['M3 5h18l-7 8v6l-4-2v-4z'],
};
