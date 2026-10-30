// Zona horaria de la app. El servidor (Netlify/Lambda) corre en UTC, así que
// CUALQUIER agregación por día/mes/año/semana sobre los timestamps del usuario
// debe anclarse a esta zona — si no, lo registrado entre 00:00 y 02:00 (hora de
// Madrid) cae en el día anterior en UTC y se contabiliza mal (heatmap, racha,
// "Tu año", agrupado de Actividad). Usar Intl resuelve el cambio CET/CEST solo.
//
// Nota: la HORA visible del reloj en Actividad se localiza en el CLIENTE (zona
// del navegador). Esto es para los cálculos que ocurren en el servidor, donde no
// hay navegador al que diferir; ahí la referencia correcta es la zona de la app.
export const APP_TZ = 'Europe/Madrid';

const _ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export interface AppDateParts {
    year: number;
    month: number;   // 0-based, igual que Date.getMonth()
    day: number;     // 1-31
    weekday: number; // 0=Domingo .. 6=Sábado, igual que Date.getDay()
    key: string;     // "YYYY-MM-DD" (en hora de Madrid), ordenable
    dayNum: number;  // nº de día absoluto desde época, para rachas consecutivas
}

/**
 * Semana ISO 8601 de un instante, en hora de Madrid: `"2026-W33"`.
 *
 * ISO empieza las semanas en LUNES, que es justo lo que promete el subtítulo del ranking semanal («se
 * actualiza los lunes»). El año lo decide el jueves de esa semana, no el 1 de enero: por eso el 31 de
 * diciembre puede caer en la semana 1 del año siguiente, y esto lo respeta — si no, cada Nochevieja
 * habría una semana fantasma.
 */
export function isoWeekKey(ts: number): string {
    const { year, month, day } = appDateParts(ts);
    const d = new Date(Date.UTC(year, month, day));
    const weekday = d.getUTCDay() || 7;            // 1 = lunes … 7 = domingo
    d.setUTCDate(d.getUTCDate() + 4 - weekday);    // al jueves de su semana
    const isoYear = d.getUTCFullYear();
    const jan1 = Date.UTC(isoYear, 0, 1);
    const week = Math.ceil(((d.getTime() - jan1) / 86400000 + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Descompone un timestamp (ms) en sus partes de calendario en hora de Madrid. */
export function appDateParts(ts: number): AppDateParts {
    const iso = _ymd.format(new Date(ts)); // "YYYY-MM-DD" ya en Madrid
    const [year, m, day] = iso.split('-').map(Number);
    // Reconstruir como UTC-medianoche de esa fecha-calendario da weekday y nº de
    // día estables sin reintroducir el desfase del servidor.
    const utc = Date.UTC(year, m - 1, day);
    return {
        year,
        month: m - 1,
        day,
        weekday: new Date(utc).getUTCDay(),
        key: iso,
        dayNum: Math.round(utc / 86400000),
    };
}

const _MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Fecha de un día del calendario (`"YYYY-MM-DD"`, como `watch_log.watched_on`) en relativo y en
 * hora de Madrid: «hoy», «ayer», «hace 3 días», «hace 1 semana», «hace 2 semanas»… y, pasadas 8
 * semanas, «el 3 de marzo» (con el año si no es el actual). Perfil público · «Lo último visto».
 */
export function relativeDayLabel(dateISO: string, now = Date.now()): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO || '');
    if (!m) return '';
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const today = appDateParts(now);
    const diff = Math.round((Date.UTC(today.year, today.month, today.day) - Date.UTC(y, mo - 1, d)) / 86_400_000);
    if (diff <= 0) return 'hoy';
    if (diff === 1) return 'ayer';
    if (diff < 7) return `hace ${diff} días`;
    const weeks = Math.floor(diff / 7);
    if (weeks <= 8) return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`;
    return `el ${d} de ${_MONTHS[mo - 1]}${y !== today.year ? ` de ${y}` : ''}`;
}
