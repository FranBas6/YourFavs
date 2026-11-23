/**
 * Textos de las sagas (2026-11-23, C3): fechas cortas, iniciales para el hueco del póster y «cuándo»
 * de una película próxima. Puro: lo usan la página de saga, el bloque de la ficha y Mis listas › Sagas.
 */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «18 dic 2026» (fecha «YYYY-MM-DD»). */
export function shortDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Iniciales para el hueco del póster: «Castillo infinito 2» → «CI2». Máx. 4 caracteres. */
export function titleInitials(title: string): string {
    const words = title.replace(/[«»"'():·,.-]/g, ' ').split(/\s+/).filter(Boolean);
    const out = words
        .filter((w) => /^\d+$/.test(w) || (w.length > 2 && !/^(de|del|la|las|los|el|y|the|of|and)$/i.test(w)))
        .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
        .join('');
    return (out || title.slice(0, 2).toUpperCase()).slice(0, 4);
}

/**
 * Cuándo sale una película próxima: la fecha en tu país si la hay («18 dic 2026 · cines en España»),
 * si no la mundial («18 dic 2026»), y si no hay ninguna, «Por anunciar».
 */
export function upcomingWhen(
    worldDate: string | null | undefined,
    local: { cinema: string | null; digital: string | null },
    countryName = 'España',
): string {
    if (local.cinema) return `${shortDate(local.cinema)} · cines en ${countryName}`;
    if (local.digital) return `${shortDate(local.digital)} · digital en ${countryName}`;
    if (worldDate) return shortDate(worldDate);
    return 'Por anunciar';
}

/** Días que faltan hasta una fecha («en 25 días», «mañana», «hoy»); null si ya pasó. */
export function daysUntil(iso: string | null | undefined, todayISO = new Date().toISOString().slice(0, 10)): string | null {
    if (!iso) return null;
    const a = Date.UTC(+todayISO.slice(0, 4), +todayISO.slice(5, 7) - 1, +todayISO.slice(8, 10));
    const b = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const d = Math.round((b - a) / 86400000);
    if (d < 0) return null;
    if (d === 0) return 'hoy';
    if (d === 1) return 'mañana';
    return `en ${d} días`;
}
