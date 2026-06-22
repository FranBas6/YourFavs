/**
 * Brief diario — "Hoy en tu cine" (apuesta ① de "El salto").
 *
 * Compone 3-4 señales priorizadas SOBRE datos que ya tenemos, sin features nuevas:
 *   · new_episode  — episodio reciente sin ver de una serie en seguimiento (de `nextEpisode`).
 *   · on_platform  — un pendiente que está en una de TUS plataformas (cruce providers).
 *   · anniversary  — "hace un año…" (efeméride sobre `WatchLog`).
 *   · finishing    — "te quedan N para terminar…" (progreso de seguimiento).
 *
 * Coste: cacheado por **uid + día** (L1 memoria + L2 Blobs). El cruce
 * pendientes×proveedores (lo único caro) se aísla en `getPendientesOnMyPlatforms`,
 * también cacheado por día, para que el Radar (②) lo reutilice sin recomputar.
 */
import { tmdbFetch } from './tmdbClient';
import { mapAndDeduplicateProviders } from './tmdbInfoService';
import { getNextEpisodesData, type NextEpisodeItem } from '../Series/nextEpisode';
import { getLibrarySnapshot } from '../../BD/shared/librarySnapshot';
import { getWatchLogOnDate } from '../../BD/lists/watchLog';
import { getCurrentUid, getCurrentRegion } from '../../BD/shared/userScope';
import { getCached, setCached } from '../../../utils/recsBlobCache';
import { processBatch } from '../../../utils/processBatch';
import { appDateParts, APP_TZ } from '../../../utils/appTime';

export type BriefSignalKind = 'new_episode' | 'on_platform' | 'anniversary' | 'finishing';

export interface BriefSignal {
    kind: BriefSignalKind;
    title: string;
    subtitle: string;
    href: string;
    poster_path: string | null;
}

export interface DailyBrief {
    /** "Lunes 22 de junio" (hora de Madrid). */
    dateLabel: string;
    signals: BriefSignal[];
}

const DAY_TTL_MS = 18 * 60 * 60 * 1000;
const briefL1 = new Map<string, { data: DailyBrief; expires: number }>();
const platformsL1 = new Map<string, { data: PendienteOnPlatform[]; expires: number }>();

const MAX_PENDIENTES_CHECKED = 30;

export interface PendienteOnPlatform {
    id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    provider_id: number;
    provider_name: string;
}

/** Clave de día (Madrid) para cachear "por uid + día". */
function todayKey(): string {
    return appDateParts(Date.now()).key;
}

function dateLabel(): string {
    const raw = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: APP_TZ,
    }).format(new Date()).replace(',', '');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** "YYYY-MM-DD" de hace exactamente un año (mismo día de calendario). */
function oneYearAgoKey(): string {
    const [y, m, d] = todayKey().split('-');
    return `${Number(y) - 1}-${m}-${d}`;
}

const hrefFor = (mediaType: 'movie' | 'tv', id: string | number) =>
    mediaType === 'movie' ? `/movie/${id}` : `/serie/${id}`;

/**
 * Pendientes (peli+serie) que AHORA están en flatrate de alguna de tus plataformas.
 * Capa de señales compartida (Brief ① + Radar ②). Cacheada por uid + día.
 */
export async function getPendientesOnMyPlatforms(platforms: number[]): Promise<PendienteOnPlatform[]> {
    const uid = getCurrentUid();
    if (!uid || platforms.length === 0) return [];

    const key = `pendientesOnPlatforms_v1_${uid}_${todayKey()}`;
    const now = Date.now();
    const l1 = platformsL1.get(uid);
    if (l1 && l1.expires > now) return l1.data;
    const l2 = await getCached<PendienteOnPlatform[]>(key);
    if (l2) { platformsL1.set(uid, { data: l2, expires: now + DAY_TTL_MS }); return l2; }

    const snap = await getLibrarySnapshot();
    const jobs = [
        ...snap.movPend.map((m: any) => ({ id: String(m.id), type: 'movie' as const })),
        ...snap.tvPend.map((s: any) => ({ id: String(s.id), type: 'tv' as const })),
    ].slice(0, MAX_PENDIENTES_CHECKED);

    const want = new Set(platforms);
    const region = getCurrentRegion();

    const results = await processBatch(jobs, async (j): Promise<PendienteOnPlatform | null> => {
        try {
            const detail = await tmdbFetch<any>(`/${j.type}/${j.id}`, { append_to_response: 'watch/providers' });
            const rawES = detail['watch/providers']?.results?.[region] || detail['watch/providers']?.results?.ES || {};
            const match = mapAndDeduplicateProviders(rawES)
                .filter((p) => p.type === 'flatrate' && want.has(p.provider_id))[0];
            if (!match) return null;
            return {
                id: String(j.id),
                media_type: j.type,
                title: j.type === 'movie' ? detail.title : detail.name,
                poster_path: detail.poster_path ?? null,
                provider_id: match.provider_id,
                provider_name: match.provider_name,
            };
        } catch {
            return null;
        }
    }, 8);

    const list = results.filter((x): x is PendienteOnPlatform => x !== null && !!x.title);
    platformsL1.set(uid, { data: list, expires: now + DAY_TTL_MS });
    await setCached(key, list, DAY_TTL_MS);
    return list;
}

/** Efeméride "hace un año": resuelve título/póster de una entrada del diario de esa fecha. */
async function anniversarySignal(): Promise<BriefSignal | null> {
    const entries = await getWatchLogOnDate(oneYearAgoKey());
    // Prioriza pelis (re-ver es más natural) y descarta episodios sueltos de serie.
    const pick = entries.find((e) => e.media_type === 'movie')
        || entries.find((e) => e.media_type === 'tv' && e.season == null);
    if (!pick) return null;
    try {
        const detail = await tmdbFetch<any>(`/${pick.media_type}/${pick.tmdb_id}`);
        const title = pick.media_type === 'movie' ? detail.title : detail.name;
        if (!title) return null;
        return {
            kind: 'anniversary',
            title,
            subtitle: 'Hace un año lo viste · ¿lo revés?',
            href: hrefFor(pick.media_type, pick.tmdb_id),
            poster_path: detail.poster_path ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Brief del día. `nextEpisodes` opcional: si la home ya lo calculó (panel
 * "Continuar viendo"), lo pasa para no recomputar en el primer hit del día.
 */
export async function getDailyBrief(
    opts: { platforms?: number[]; nextEpisodes?: NextEpisodeItem[] } = {}
): Promise<DailyBrief> {
    const uid = getCurrentUid();
    const label = dateLabel();
    if (!uid) return { dateLabel: label, signals: [] };

    const key = `dailyBrief_v1_${uid}_${todayKey()}`;
    const now = Date.now();
    const l1 = briefL1.get(uid);
    if (l1 && l1.expires > now) return l1.data;
    const l2 = await getCached<DailyBrief>(key);
    if (l2) { briefL1.set(uid, { data: l2, expires: now + DAY_TTL_MS }); return l2; }

    const platforms = opts.platforms ?? [];
    const today = todayKey();
    const weekAgo = appDateParts(now - 7 * 86400000).key;

    const [nextEpisodes, onPlatform, anniversary] = await Promise.all([
        opts.nextEpisodes ? Promise.resolve(opts.nextEpisodes) : getNextEpisodesData(),
        getPendientesOnMyPlatforms(platforms),
        anniversarySignal(),
    ]);

    const usedSeries = new Set<number>();
    const signals: BriefSignal[] = [];

    // ① Episodio reciente sin ver (emitido en los últimos 7 días) de algo que sigues.
    const recent = nextEpisodes
        .filter((e) => e.air_date && e.air_date >= weekAgo && e.air_date <= today)
        .sort((a, b) => (b.air_date || '').localeCompare(a.air_date || ''))[0];
    if (recent) {
        usedSeries.add(recent.id);
        signals.push({
            kind: 'new_episode',
            title: recent.name,
            subtitle: `T${recent.next_season}·E${recent.next_episode} · ${recent.air_date === today ? 'hoy' : 'esta semana'}`,
            href: hrefFor('tv', recent.id),
            poster_path: recent.poster_path,
        });
    }

    // ② Pendiente disponible en tu plataforma.
    if (onPlatform[0]) {
        const p = onPlatform[0];
        signals.push({
            kind: 'on_platform',
            title: p.title,
            subtitle: `Ya en ${p.provider_name} · de tus pendientes`,
            href: hrefFor(p.media_type, p.id),
            poster_path: p.poster_path,
        });
    }

    // ③ Hace un año.
    if (anniversary) signals.push(anniversary);

    // ④ Te quedan N para terminar (serie de seguimiento casi acabada, no usada arriba).
    const finishing = nextEpisodes
        .filter((e) => !usedSeries.has(e.id) && e.total_count > 0)
        .map((e) => ({ e, remaining: e.total_count - e.watched_count }))
        .filter((x) => x.remaining >= 1 && x.remaining <= 2)
        .sort((a, b) => a.remaining - b.remaining)[0];
    if (finishing) {
        const rem = finishing.remaining;
        signals.push({
            kind: 'finishing',
            title: finishing.e.name,
            subtitle: `Te ${rem === 1 ? 'queda 1 episodio' : `quedan ${rem} episodios`} para terminar`,
            href: hrefFor('tv', finishing.e.id),
            poster_path: finishing.e.poster_path,
        });
    }

    // Dedup por destino (un mismo título no repite tarjeta).
    const seen = new Set<string>();
    const deduped = signals.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true))).slice(0, 4);

    const brief: DailyBrief = { dateLabel: label, signals: deduped };
    briefL1.set(uid, { data: brief, expires: now + DAY_TTL_MS });
    await setCached(key, brief, DAY_TTL_MS);
    return brief;
}
