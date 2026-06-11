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
