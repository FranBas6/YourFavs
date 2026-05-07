import type { APIRoute } from 'astro';
import { getCalendarData } from '../../../services/API/Calendar/calendarService';

export const prerender = false;

const MONTHS_AHEAD = 3;

function escapeICS(text: string): string {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

function formatDateICS(yyyymmdd: string): string {
    return yyyymmdd.replace(/-/g, '');
}

function nextDay(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export const GET: APIRoute = async ({ url }) => {
    try {
        const baseUrl = `${url.protocol}//${url.host}`;
        const now = new Date();
        const targets: { year: number; month: number }[] = [];
        for (let i = 0; i < MONTHS_AHEAD; i++) {
            const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
            targets.push({ year: dt.getFullYear(), month: dt.getMonth() + 1 });
        }

        const monthsData = await Promise.all(targets.map(t => getCalendarData(t.year, t.month)));

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//YourFavs//Calendar//ES',
            'METHOD:PUBLISH',
            'CALSCALE:GREGORIAN',
            'X-WR-CALNAME:YourFavs · Tus estrenos',
            'X-WR-TIMEZONE:Europe/Madrid',
        ];

        const seen = new Set<string>();
        const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        for (const md of monthsData) {
            for (const day of md.days) {
                for (const ev of day.events) {
                    if (!ev.is_subscribed) continue;
                    const uid = `${ev.media_type}-${ev.tmdb_id}-${day.date}@yourfavs`;
                    if (seen.has(uid)) continue;
                    seen.add(uid);

                    const linkPath = ev.media_type === 'movie' ? `/movie/${ev.tmdb_id}` : `/serie/${ev.tmdb_id}`;
                    const summary = ev.media_type === 'movie'
                        ? `🎬 ${ev.title}`
                        : `📺 ${ev.title} — ${ev.label}`;

                    lines.push(
                        'BEGIN:VEVENT',
                        `UID:${uid}`,
                        `DTSTAMP:${dtstamp}`,
                        `DTSTART;VALUE=DATE:${formatDateICS(day.date)}`,
                        `DTEND;VALUE=DATE:${formatDateICS(nextDay(day.date))}`,
                        `SUMMARY:${escapeICS(summary)}`,
                        `DESCRIPTION:${escapeICS(ev.label)}`,
                        `URL:${baseUrl}${linkPath}`,
                        'END:VEVENT',
                    );
                }
            }
        }

        lines.push('END:VCALENDAR');
        const body = lines.join('\r\n') + '\r\n';

        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="yourfavs.ics"',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('Error generando ICS:', error);
        return new Response('Error generando calendario', { status: 500 });
    }
};
