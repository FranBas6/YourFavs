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

const MAX_PENDIENTES_CHECKED = 60; // N3 (2026-10-28): 30 dejaba fuera media watchlist
const MAX_FAVLIKE_CHECKED = 40;

export interface PendienteOnPlatform {
    id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    provider_id: number;
    provider_name: string;
}

/** De qué lista viene un título disponible en plataforma (para el copy de la campana). */
export type LibraryOrigin = 'watchlist' | 'fav' | 'like';

export interface LibraryOnPlatform extends PendienteOnPlatform {
    origin: LibraryOrigin;
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
 * Cruce títulos×proveedores: para cada job {id,type}, ¿está en flatrate de alguna de
 * TUS plataformas? Es lo único caro (1 fetch TMDB por título, en lotes de 8). Lo
 * comparten `getPendientesOnMyPlatforms` (watchlist) y `getLibraryOnMyPlatforms`
 * (favs/likes) para no duplicar la lógica ni las llamadas.
 */
async function resolveOnPlatforms(
    jobs: { id: string; type: 'movie' | 'tv' }[],
    platforms: number[],
): Promise<PendienteOnPlatform[]> {
    if (!jobs.length) return [];
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

    return results.filter((x): x is PendienteOnPlatform => x !== null && !!x.title);
}

/**
 * Watchlist (Pendientes + Ver pronto, peli+serie) que AHORA está en flatrate de alguna
 * de tus plataformas. Capa de señales compartida (Brief ① + Radar ②). Cacheada por
 * uid + día. "Ver pronto" va primero (mayor intención) al recortar por el tope.
 */
export async function getPendientesOnMyPlatforms(platforms: number[]): Promise<PendienteOnPlatform[]> {
    const uid = getCurrentUid();
    if (!uid || platforms.length === 0) return [];

    const key = `pendientesOnPlatforms_v2_${uid}_${todayKey()}`;
    const now = Date.now();
    const l1 = platformsL1.get(uid);
    if (l1 && l1.expires > now) return l1.data;
    const l2 = await getCached<PendienteOnPlatform[]>(key);
    if (l2) { platformsL1.set(uid, { data: l2, expires: now + DAY_TTL_MS }); return l2; }

    const snap = await getLibrarySnapshot();
    // Ver pronto primero (mayor intención), luego Pendientes; dedup por tipo:id (un
    // título puede estar en ambas listas) y recorte al tope de coste TMDB.
    const seenJob = new Set<string>();
    const jobs = [
        ...snap.movVerPronto.map((m: any) => ({ id: String(m.id), type: 'movie' as const })),
        ...snap.tvVerPronto.map((s: any) => ({ id: String(s.id), type: 'tv' as const })),
        ...snap.movPend.map((m: any) => ({ id: String(m.id), type: 'movie' as const })),
        ...snap.tvPend.map((s: any) => ({ id: String(s.id), type: 'tv' as const })),
    ].filter((j) => { const k = `${j.type}:${j.id}`; if (seenJob.has(k)) return false; seenJob.add(k); return true; })
     .slice(0, MAX_PENDIENTES_CHECKED);

    const list = await resolveOnPlatforms(jobs, platforms);
    platformsL1.set(uid, { data: list, expires: now + DAY_TTL_MS });
    await setCached(key, list, DAY_TTL_MS);
    return list;
}

const favLikeL1 = new Map<string, { data: LibraryOnPlatform[]; expires: number }>();

/**
 * Biblioteca ampliada disponible en tus plataformas — SOLO para la campana:
 * watchlist (Pendientes + Ver pronto) ∪ Favoritos ∪ Me gusta. Cada título llega
 * etiquetado con su `origin` para que el copy distinga "tu favorito" de "de tu lista".
 *
 * Reutiliza el resultado ya cacheado de `getPendientesOnMyPlatforms` (no re-fetchea la
 * watchlist) y solo añade el cruce de favs/likes que NO estén ya cubiertos. El Brief y
 * el Radar NO usan esto: ellos siguen viendo solo pendientes (semántica intacta).
 */
export async function getLibraryOnMyPlatforms(platforms: number[]): Promise<LibraryOnPlatform[]> {
    const uid = getCurrentUid();
    if (!uid || platforms.length === 0) return [];

    // ① Watchlist: reutiliza la función cacheada; etiqueta origin.
    const watchlist: LibraryOnPlatform[] = (await getPendientesOnMyPlatforms(platforms))
        .map((p) => ({ ...p, origin: 'watchlist' as const }));
    const covered = new Set(watchlist.map((p) => `${p.media_type}:${p.id}`));

    // ② Favs + Me gusta: cruce propio, cacheado por uid+día (excluye lo ya en watchlist).
    const now = Date.now();
    const key = `favLikeOnPlatforms_v1_${uid}_${todayKey()}`;
    const l1 = favLikeL1.get(uid);
    let favLike: LibraryOnPlatform[] | undefined = l1 && l1.expires > now ? l1.data : undefined;
    if (!favLike) {
        const l2 = await getCached<LibraryOnPlatform[]>(key);
        if (l2) { favLikeL1.set(uid, { data: l2, expires: now + DAY_TTL_MS }); favLike = l2; }
    }
    if (!favLike) {
        const snap = await getLibrarySnapshot();
        // Favoritos primero (mayor valor emocional), luego Me gusta; dedup por tipo:id.
        const originByKey = new Map<string, LibraryOrigin>();
        const seen = new Set<string>();
        const jobs = [
            ...snap.movFavs.map((m: any) => ({ id: String(m.id), type: 'movie' as const, origin: 'fav' as const })),
            ...snap.tvFavs.map((s: any) => ({ id: String(s.id), type: 'tv' as const, origin: 'fav' as const })),
            ...snap.movLike.map((m: any) => ({ id: String(m.id), type: 'movie' as const, origin: 'like' as const })),
            ...snap.tvLike.map((s: any) => ({ id: String(s.id), type: 'tv' as const, origin: 'like' as const })),
        ].filter((j) => {
            const k = `${j.type}:${j.id}`;
            if (covered.has(k) || seen.has(k)) return false;   // ya en watchlist o repetido
            seen.add(k); originByKey.set(k, j.origin); return true;
        });

        const capped = jobs.slice(0, MAX_FAVLIKE_CHECKED);
        if (jobs.length > capped.length) {
            console.warn(`[notifications] favs/likes en plataforma: ${jobs.length} candidatos, se comprueban ${capped.length} (tope ${MAX_FAVLIKE_CHECKED}); ${jobs.length - capped.length} sin comprobar hoy.`);
        }

        const resolved = await resolveOnPlatforms(capped, platforms);
        favLike = resolved.map((p) => ({ ...p, origin: originByKey.get(`${p.media_type}:${p.id}`) ?? 'fav' }));
        favLikeL1.set(uid, { data: favLike, expires: now + DAY_TTL_MS });
        await setCached(key, favLike, DAY_TTL_MS);
    }

    return [...watchlist, ...favLike];
}

/** Efeméride "hace un año": resuelve título/póster de una entrada del diario de esa fecha. */
export async function anniversarySignal(): Promise<BriefSignal | null> {
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
