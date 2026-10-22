/**
 * El calendario .ics (iCalendar) que se suscribe en Google, Apple u Outlook.
 *
 * Mensajes M5c (handoff M5 §3.8): cada persona tiene su dirección secreta
 * `/api/calendar/u/{token}.ics` (ver `services/BD/profile/icsToken.ts`). Las apps de calendario no
 * mandan la cookie de sesión, así que el feed se genera EN NOMBRE del dueño de la dirección:
 * `userFeed` abre el mismo contexto de usuario que el middleware (`runWithUser`) con el cliente
 * del servidor, y las funciones de `services/BD/**` leen sus filas como siempre (todas filtran por
 * `user_id`).
 *
 * Lleva:
 *   · los estrenos con campana (como antes);
 *   · con «Incluir mis planes», tus planes con «Voy»: título, día y hora (o el día entero), «YourFavs ·
 *     Plan» y el enlace al chat. Sin la nota ni los nombres, por si la dirección se comparte.
 */
import { getCalendarData, hideEpisodeTitlesFor, type CalendarData } from './calendarService';
import { runWithUser, setRequestPrefs } from '../../BD/shared/userScope';
import type { SupabaseServer } from '../../../lib/supabase/server';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { resolveSpoilerSettings, type UserProfile } from '../../BD/profile/userProfile';
import { myPlans, type MyPlan } from '../../BD/social/plans';
import { appDateParts } from '../../../utils/appTime';

const MONTHS_AHEAD = 3;
/** Los planes de hasta un mes atrás se quedan en el calendario de la app. */
const PLANS_DAYS_BACK = 30;
/** Duración de un plan con hora (una película). */
const PLAN_HOURS = 2;

function escapeICS(text: string): string {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/** RFC 5545: líneas de 75 octetos como mucho; el resto sigue en la siguiente con un espacio. */
const enc = new TextEncoder();
function fold(line: string): string {
    if (enc.encode(line).length <= 75) return line;
    const out: string[] = [];
    let cur = '';
    let len = 0;
    for (const ch of line) {
        const n = enc.encode(ch).length;
        if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
        cur += ch;
        len += n;
    }
    out.push(cur);
    return out.join('\r\n ');
}

const ymd = (iso: string) => iso.replace(/-/g, '');
function addDays(iso: string, n: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** «2026-10-30» + «23:00» + h horas → «20261031T010000» (hora local de Madrid, sin zona). */
function localStamp(date: string, time: string, plusHours = 0): string {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh + plusHours, mm)).toISOString().replace(/[-:]/g, '').slice(0, 15);
}

// La zona de los planes con hora (CET/CEST), para que las apps no la tengan que adivinar.
const VTIMEZONE = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
];

const dtstampNow = () => new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

/** Envuelve los eventos en un VCALENDAR. */
function calendar(events: string[][], withZone: boolean): string {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//YourFavs//Calendar//ES',
        'METHOD:PUBLISH',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:YourFavs',
        'X-WR-TIMEZONE:Europe/Madrid',
        ...(withZone ? VTIMEZONE : []),
        ...events.flat(),
        'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
}

/** Los estrenos con campana de los meses pedidos. */
function releaseEvents(months: CalendarData[], baseUrl: string, dtstamp: string): string[][] {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const md of months) {
        for (const day of md.days) {
            for (const ev of day.events) {
                if (!ev.is_subscribed) continue;
                const uid = `${ev.media_type}-${ev.tmdb_id}-${day.date}@yourfavs`;
                if (seen.has(uid)) continue;
                seen.add(uid);
                const linkPath = ev.media_type === 'movie' ? `/movie/${ev.tmdb_id}` : `/serie/${ev.tmdb_id}`;
                const summary = ev.media_type === 'movie' ? `🎬 ${ev.title}` : `📺 ${ev.title} — ${ev.label}`;
                out.push([
                    'BEGIN:VEVENT',
                    `UID:${uid}`,
                    `DTSTAMP:${dtstamp}`,
                    `DTSTART;VALUE=DATE:${ymd(day.date)}`,
                    `DTEND;VALUE=DATE:${ymd(addDays(day.date, 1))}`,
                    `SUMMARY:${escapeICS(summary)}`,
                    `DESCRIPTION:${escapeICS(ev.label)}`,
                    `URL:${baseUrl}${linkPath}`,
                    'END:VEVENT',
                ]);
            }
        }
    }
    return out;
}

/** Un plan: título, día y hora (o el día entero). Sin nota ni nombres. */
function planEvents(plans: MyPlan[], baseUrl: string, dtstamp: string): string[][] {
    return plans.map((p) => [
        'BEGIN:VEVENT',
        `UID:plan-${p.id}@yourfavs`,
        `DTSTAMP:${dtstamp}`,
        ...(p.time
            ? [`DTSTART;TZID=Europe/Madrid:${localStamp(p.date, p.time)}`, `DTEND;TZID=Europe/Madrid:${localStamp(p.date, p.time, PLAN_HOURS)}`]
            : [`DTSTART;VALUE=DATE:${ymd(p.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(p.date, 1))}`]),
        `SUMMARY:${escapeICS(`🍿 ${p.title}`)}`,
        'DESCRIPTION:YourFavs · Plan',
        `URL:${baseUrl}/mislistas/amigos/mensajes/${p.convId}`,
        'END:VEVENT',
    ]);
}

/** El calendario de una persona (su dirección secreta). */
export async function userFeed(userId: string, opts: { plans: boolean; baseUrl: string }): Promise<string> {
    const admin = supabaseAdmin();
    // Lo que en la web pone el middleware: idioma, región y el modo sin spoilers del dueño.
    const { data: prof } = await admin.from('profiles')
        .select('language, region, spoilers, spoiler_free').eq('id', userId).maybeSingle();
    const spoilers = resolveSpoilerSettings(prof
        ? { spoilers: (prof.spoilers ?? undefined) as UserProfile['spoilers'], spoilerFree: prof.spoiler_free ?? undefined }
        : null);
    // Si la web tapa los títulos de episodio, aquí también.
    const hideEpisodeTitles = hideEpisodeTitlesFor({ spoilers } as Parameters<typeof hideEpisodeTitlesFor>[0]);

    return runWithUser(userId, async () => {
        setRequestPrefs({ language: prof?.language, region: prof?.region });
        const now = new Date();
        const months = await Promise.all(Array.from({ length: MONTHS_AHEAD }, (_, i) => {
            const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
            return getCalendarData(dt.getFullYear(), dt.getMonth() + 1, { hideEpisodeTitles });
        }));
        const plans = opts.plans
            ? (await myPlans(userId, addDays(appDateParts(Date.now()).key, -PLANS_DAYS_BACK)).catch(() => ({ plans: [] as MyPlan[] }))).plans
            : [];
        const dtstamp = dtstampNow();
        return calendar([...planEvents(plans, opts.baseUrl, dtstamp), ...releaseEvents(months, opts.baseUrl, dtstamp)], plans.some((p) => p.time));
    }, { db: admin as unknown as SupabaseServer, authId: userId });
}

/**
 * La dirección antigua, la misma para todos (`/api/calendar/subscribe.ics`). Ya no saca nada
 * personal: un solo evento, hoy, que pide pasar a la dirección propia. Las apps la consultaban
 * sin sesión, así que nunca llevó estrenos fuera de la web: no se pierde nada.
 */
export function legacyFeed(baseUrl: string): string {
    const today = appDateParts(Date.now()).key;
    return calendar([[
        'BEGIN:VEVENT',
        `UID:legacy-notice@yourfavs`,
        `DTSTAMP:${dtstampNow()}`,
        `DTSTART;VALUE=DATE:${ymd(today)}`,
        `DTEND;VALUE=DATE:${ymd(addDays(today, 1))}`,
        `SUMMARY:${escapeICS('Actualiza tu suscripción en YourFavs → Ajustes → Calendario')}`,
        `DESCRIPTION:${escapeICS('Esta dirección ya no se actualiza. Cada persona tiene ahora la suya, privada.')}`,
        `URL:${baseUrl}/perfil/calendario`,
        'END:VEVENT',
    ]], false);
}
