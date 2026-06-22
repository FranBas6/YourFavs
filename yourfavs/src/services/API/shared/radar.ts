/**
 * Radar — "no te pierdas lo tuyo" (apuesta ② de "El salto").
 *
 * Reúne en una vista TODO lo que se mueve de lo que le importa al usuario, sobre
 * datos que ya tenemos:
 *   · episodes  — próximos episodios (esta semana) de series en seguimiento.
 *   · platforms — pendientes que están en TUS plataformas (capa compartida con el Brief ①).
 *   · people    — estrenos próximos de personas que sigues (`upcomingReleases`, ya existe).
 *
 * Enfocado y barato (solo lo personal, NO el discover mensual del calendario):
 * 1 fetch por serie en seguimiento. Cacheado por **uid + día** (L1 + L2 Blobs).
 * `count` (badge) = nº total de novedades.
 */
import { fetchSerieDetails } from '../Series/tmdbSeries';
import { getSeriesSiguiendo } from '../../BD/series/yourfavsSerie';
import { getUpcomingFromFollowedPeople } from '../People/upcomingReleases';
import { getPendientesOnMyPlatforms } from './dailyBrief';
import { getCurrentUid } from '../../BD/shared/userScope';
import { getCached, setCached } from '../../../utils/recsBlobCache';
import { processBatch } from '../../../utils/processBatch';
import { appDateParts } from '../../../utils/appTime';

export interface RadarItem {
    tmdb_id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    href: string;
    meta: string;
}

export type RadarGroupKey = 'episodes' | 'platforms' | 'people';

export interface RadarGroup {
    key: RadarGroupKey;
    title: string;
    color: string;
    items: RadarItem[];
}

export interface Radar {
    groups: RadarGroup[];
    count: number;
}

const DAY_TTL_MS = 18 * 60 * 60 * 1000;
const EPISODE_WINDOW_DAYS = 7;
const PEOPLE_WINDOW_DAYS = 90;
const PEOPLE_MAX = 8;

const l1 = new Map<string, { data: Radar; expires: number }>();

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function todayKey(): string { return appDateParts(Date.now()).key; }

/** Etiqueta relativa de una fecha "YYYY-MM-DD": Hoy / Mañana / Vie / 25 jun. */
function relLabel(dateISO: string): string {
    const t = appDateParts(new Date(dateISO + 'T12:00:00').getTime());
    const diff = t.dayNum - appDateParts(Date.now()).dayNum;
    let label: string;
    if (diff === 0) label = 'hoy';
    else if (diff === 1) label = 'mañana';
    else if (diff > 1 && diff <= 7) label = WEEKDAYS[t.weekday];
    else label = `${t.day} ${MONTHS[t.month]}`;
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function daysFromToday(dateISO: string): number {
    const t = appDateParts(new Date(dateISO + 'T12:00:00').getTime());
    return t.dayNum - appDateParts(Date.now()).dayNum;
}

export async function getRadar(platforms: number[] = []): Promise<Radar> {
    const uid = getCurrentUid();
    if (!uid) return { groups: [], count: 0 };

    const key = `radar_v2_${uid}_${todayKey()}`;
    const now = Date.now();
    const cachedL1 = l1.get(uid);
    if (cachedL1 && cachedL1.expires > now) return cachedL1.data;
    const cachedL2 = await getCached<Radar>(key);
    if (cachedL2) { l1.set(uid, { data: cachedL2, expires: now + DAY_TTL_MS }); return cachedL2; }

    const [followed, onPlatform, people] = await Promise.all([
        getSeriesSiguiendo(),
        getPendientesOnMyPlatforms(platforms),
        getUpcomingFromFollowedPeople().catch(() => []),
    ]);

    // ① Próximos episodios (esta semana) de series en seguimiento.
    const details = await processBatch(
        followed.map((s: any) => String(s.id)),
        (id) => fetchSerieDetails(id).catch(() => null),
        10,
    );
    const episodes: RadarItem[] = [];
    for (const d of details) {
        const ep = d?.next_episode_to_air;
        if (!ep?.air_date) continue;
        const diff = daysFromToday(ep.air_date);
        if (diff < 0 || diff > EPISODE_WINDOW_DAYS) continue;
        episodes.push({
            tmdb_id: String(d.id),
            media_type: 'tv',
            title: d.name,
            poster_path: d.poster_path ?? null,
            href: `/serie/${d.id}`,
            meta: `T${ep.season_number}·E${ep.episode_number} · ${relLabel(ep.air_date)}`,
        });
    }
    episodes.sort((a, b) => a.meta.localeCompare(b.meta));

    // ② Pendientes en tus plataformas (capa compartida, ya cacheada por día).
    const platformItems: RadarItem[] = onPlatform.map((p) => ({
        tmdb_id: p.id,
        media_type: p.media_type,
        title: p.title,
        poster_path: p.poster_path,
        href: p.media_type === 'movie' ? `/movie/${p.id}` : `/serie/${p.id}`,
        meta: `${p.provider_name} · Pendientes`,
    }));

    // ③ Estrenos de quien sigues (próximos 90 días).
    const peopleItems: RadarItem[] = people
        .filter((u) => { const dd = daysFromToday(u.release_date); return dd >= 0 && dd <= PEOPLE_WINDOW_DAYS; })
        .slice(0, PEOPLE_MAX)
        .map((u) => {
            const names = u.person_names?.length ? u.person_names : [u.person_name];
            const who = names.length > 1 ? `${names[0]} y ${names.length - 1} más` : names[0];
            return {
                tmdb_id: u.tmdb_id,
                media_type: u.media_type,
                title: u.title,
                poster_path: u.poster_path,
                href: u.media_type === 'movie' ? `/movie/${u.tmdb_id}` : `/serie/${u.tmdb_id}`,
                meta: `${who} · ${relLabel(u.release_date)}`,
            };
        });

    const groups: RadarGroup[] = [
        { key: 'episodes', title: 'Esta semana · nuevos episodios', color: '#E63946', items: episodes },
        { key: 'platforms', title: 'Llegó a tus plataformas', color: '#34a673', items: platformItems },
        { key: 'people', title: 'De quien sigues', color: '#6d4aa0', items: peopleItems },
    ].filter((g) => g.items.length > 0);

    const radar: Radar = { groups, count: groups.reduce((n, g) => n + g.items.length, 0) };
    l1.set(uid, { data: radar, expires: now + DAY_TTL_MS });
    await setCached(key, radar, DAY_TTL_MS);
    return radar;
}
