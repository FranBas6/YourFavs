/**
 * Señales de TÍTULOS para la campana (N1 + N2, 2026-10-28). Las llama el generador una vez al día
 * por usuario (guard `notif_sync`), así que aquí no hay caché: cada consulta se hace una vez al día.
 *
 *   · Episodio nuevo: EL DÍA que se emite («T2·E5 · ya disponible»), con dos días de margen por si
 *     no abres a diario. Antes se creaba una semana antes y luego solo cambiaba el texto: parecía
 *     repetirse y nunca decía «ya está». Series en Siguiendo y las suscritas con la campana.
 *   · Temporada nueva: un aviso por temporada, para cualquier serie de tus listas (Favoritos, Me
 *     gusta, Vistas, Siguiendo) y las suscritas, cuando TMDB le pone fecha al primer episodio (hasta
 *     45 días antes) o ya salió (hasta 6 días después). Para no disparar 150 consultas al día, cada
 *     serie se mira UNA vez a la semana (ronda por id); las de Siguiendo y las suscritas, a diario.
 *   · Película suscrita («Avisarme» en la ficha): el día del estreno en cines, cuando sale en
 *     digital (alquiler/compra) y cuando llega a una de tus plataformas (o a cualquiera, si no has
 *     marcado ninguna). Hasta ahora la suscripción solo salía en el calendario: el aviso no llegaba.
 *   · Película de Ver pronto o Pendientes (N3): lo mismo, con Ver pronto a diario y Pendientes en
 *     ronda semanal; «ya en plataforma» solo si es reciente. Ver `watchlistMovieSignals`.
 *
 * Ids deterministas (uno por episodio / temporada / hito), como el resto de la campana.
 */
import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';
import { appDateParts } from '../../../utils/appTime';
import { episodeTypeLabel } from '../../../utils/episodeType';
import { getLibrarySnapshot } from '../../BD/shared/librarySnapshot';
import { getAllNotificationSubs } from '../../BD/notifications/yourfavsNotifications';
import { getCurrentRegion } from '../../BD/shared/userScope';
import { mapAndDeduplicateProviders } from '../shared/tmdbInfoService';
import type { NotifInput } from '../../BD/notifications/notifications';

/** `always`: lo pediste título a título («Avisarme»), así que llega aunque el interruptor esté apagado. */
export type TitleSignal = NotifInput & { always?: boolean };

/** Días de margen para «ya disponible»: si no abres a diario, el aviso sigue llegando. */
const GRACE_DAYS = 2;
/** Una temporada se anuncia hasta estos días antes de su primer episodio… */
const SEASON_AHEAD_DAYS = 45;
/** …y se da por «ya disponible» hasta estos días después (la ronda semanal puede llegar tarde). */
const SEASON_BEHIND_DAYS = 6;
/** Series de la ronda semanal por día (las de Siguiendo y suscritas van a diario, aparte). */
const ROUND_DAYS = 7;
/** Suscripciones de película que se comprueban al día. */
const MAX_SUBS_CHECKED = 60;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const todayNum = () => appDateParts(Date.now()).dayNum;
/** Días desde hoy hasta una fecha «YYYY-MM-DD» (negativo = pasada). */
function daysFromToday(dateISO: string): number {
    return appDateParts(new Date(dateISO + 'T12:00:00').getTime()).dayNum - todayNum();
}
/** «hoy», «mañana», «el jueves», «el 12 nov». */
function whenLabel(dateISO: string): string {
    const diff = daysFromToday(dateISO);
    const t = appDateParts(new Date(dateISO + 'T12:00:00').getTime());
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'mañana';
    if (diff > 1 && diff <= 6) return `el ${WEEKDAYS[t.weekday]}`;
    return `el ${t.day} ${MONTHS[t.month]}`;
}
/** «ya disponible», «desde ayer», «desde el lunes». */
function sinceLabel(dateISO: string): string {
    const diff = daysFromToday(dateISO);
    if (diff >= 0) return 'ya disponible';
    if (diff === -1) return 'desde ayer';
    const t = appDateParts(new Date(dateISO + 'T12:00:00').getTime());
    return `desde el ${WEEKDAYS[t.weekday]}`;
}

/** Hash estable de un id para repartir la ronda semanal. */
function bucketOf(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % ROUND_DAYS;
}

/** Episodios y temporadas (ver cabecera). */
export async function seriesSignals(): Promise<TitleSignal[]> {
    const [snap, subs] = await Promise.all([getLibrarySnapshot(), getAllNotificationSubs().catch(() => [])]);
    const subbed = new Set(subs.filter((s) => s.media_type === 'tv').map((s) => s.tmdb_id));
    // A diario: Siguiendo y suscritas. Semanal: el resto de tus listas, por turnos.
    const daily = new Set<string>([...snap.tvSig.map((s: any) => String(s.id)), ...subbed]);
    const weekly = new Set<string>();
    const turn = todayNum() % ROUND_DAYS;
    for (const s of [...snap.tvFavs, ...snap.tvLike, ...snap.tvVistos]) {
        const id = String(s.id);
        if (!daily.has(id) && bucketOf(id) === turn) weekly.add(id);
    }
    const ids = [...daily, ...weekly];
    if (!ids.length) return [];

    const details = await processBatch(ids, (id: string) => tmdbFetch<any>(`/tv/${id}`).catch(() => null), 10);
    const items: TitleSignal[] = [];
    for (let i = 0; i < ids.length; i++) {
        const d = details[i];
        const id = ids[i];
        if (!d?.name) continue;
        const href = `/serie/${id}`;
        const always = subbed.has(id) || undefined;
        const eps = [d.last_episode_to_air, d.next_episode_to_air].filter((e: any) => e?.air_date && e.season_number > 0);

        // Episodio: solo para las de a diario (Siguiendo / suscritas), el día que sale.
        if (daily.has(id)) {
            for (const ep of eps) {
                const diff = daysFromToday(ep.air_date);
                if (diff > 0 || diff < -GRACE_DAYS) continue;
                const tag = `T${ep.season_number}·E${ep.episode_number}`;
                const kind = episodeTypeLabel(ep.episode_type); // B2b: final de temporada / parón
                items.push({
                    id: `episode:${id}:${tag}`, type: 'new_episode', title: d.name,
                    subtitle: `${tag}${kind ? ` · ${kind}` : ''} · ${sinceLabel(ep.air_date)}`, href, poster_path: d.poster_path ?? null, always,
                });
            }
        }

        // Temporada nueva: el primer episodio de una temporada, con fecha. La primera temporada solo
        // cuenta si te suscribiste a la serie antes de estrenarse; en tus listas ya la has visto.
        for (const ep of eps) {
            if (ep.episode_number !== 1) continue;
            if (ep.season_number === 1 && !subbed.has(id)) continue;
            const diff = daysFromToday(ep.air_date);
            if (diff > SEASON_AHEAD_DAYS || diff < -SEASON_BEHIND_DAYS) continue;
            const n = ep.season_number;
            items.push({
                id: `season:tv:${id}:S${n}`, type: 'new_season', title: d.name,
                subtitle: `Temporada ${n} · ${diff > 0 ? `se estrena ${whenLabel(ep.air_date)}` : sinceLabel(ep.air_date)}`,
                href, poster_path: d.poster_path ?? null, always,
            });
        }
    }
    return items;
}

/** Fecha más temprana de un tipo de estreno de TMDB (3 cines, 2 limitado, 4 digital) en la región. */
function releaseOf(detail: any, region: string, types: number[]): string | null {
    const all: any[] = detail?.release_dates?.results ?? [];
    const entry = all.find((r) => r.iso_3166_1 === region) ?? all.find((r) => r.iso_3166_1 === 'ES');
    const dates = (entry?.release_dates ?? [])
        .filter((r: any) => types.includes(r.type) && r.release_date)
        .map((r: any) => String(r.release_date).slice(0, 10))
        .sort();
    return dates[0] ?? null;
}

/** Qué se avisa de una película y con qué texto de origen. */
interface MovieOpts {
    /** «pediste aviso» / «de tu lista». */
    origin: string;
    /** Días hacia atrás que cuenta un estreno como «reciente» (los de ronda semanal necesitan 6). */
    behind: number;
    /** Llega aunque el interruptor esté apagado (suscripciones). */
    always?: boolean;
    /** Emitir «ya en plataforma» solo si la película es reciente (ver `watchlistMovieSignals`). */
    platformOnlyIfRecent?: boolean;
}

/** Días desde que una película salió en digital o en cines para considerarla «recién llegada». */
const RECENT_DIGITAL_DAYS = 90;
const RECENT_CINEMA_DAYS = 180;

/** Estreno en cines, en digital y llegada a plataforma de una lista de películas. */
async function movieSignals(ids: string[], platforms: number[], o: MovieOpts): Promise<TitleSignal[]> {
    if (!ids.length) return [];
    const region = getCurrentRegion();
    const want = new Set(platforms);
    const details = await processBatch(
        ids,
        (id: string) => tmdbFetch<any>(`/movie/${id}`, { append_to_response: 'release_dates,watch/providers' }).catch(() => null),
        8,
    );
    const items: TitleSignal[] = [];
    for (let i = 0; i < ids.length; i++) {
        const d = details[i];
        const id = ids[i];
        if (!d?.title) continue;
        const href = `/movie/${id}`;
        const poster_path = d.poster_path ?? null;
        const always = o.always || undefined;

        const cinema = releaseOf(d, region, [3, 2]) ?? (d.release_date ? String(d.release_date).slice(0, 10) : null);
        const cinemaDiff = cinema ? daysFromToday(cinema) : null;
        if (cinema && cinemaDiff! <= 0 && cinemaDiff! >= -o.behind) {
            items.push({
                id: `premiere:movie:${id}`, type: 'premiere', title: d.title,
                subtitle: `${cinemaDiff === 0 ? 'Hoy en cines' : `En cines ${sinceLabel(cinema)}`} · ${o.origin}`, href, poster_path, always,
            });
        }
        const digital = releaseOf(d, region, [4]);
        const digitalDiff = digital ? daysFromToday(digital) : null;
        if (digital && digitalDiff! <= 0 && digitalDiff! >= -o.behind) {
            items.push({
                id: `digital:movie:${id}`, type: 'premiere', title: d.title,
                subtitle: `En digital (alquiler o compra) · ${sinceLabel(digital)} · ${o.origin}`, href, poster_path, always,
            });
        }
        // En plataforma: la tuya si has marcado alguna; si no, cualquiera. Una vez por película.
        const raw = d['watch/providers']?.results?.[region] ?? d['watch/providers']?.results?.ES ?? {};
        const flat = mapAndDeduplicateProviders(raw).filter((p) => p.type === 'flatrate');
        const match = want.size ? flat.find((p) => want.has(p.provider_id)) : flat[0];
        if (!match) continue;
        if (o.platformOnlyIfRecent) {
            const recent = (digitalDiff != null && digitalDiff <= 0 && digitalDiff >= -RECENT_DIGITAL_DAYS)
                || (cinemaDiff != null && cinemaDiff <= 0 && cinemaDiff >= -RECENT_CINEMA_DAYS);
            if (!recent) continue;
        }
        items.push({
            id: `onplatform:movie:${id}`, type: 'platform_change', title: d.title,
            subtitle: `Ya en ${match.provider_name} · ${o.origin}`, href, poster_path, always,
        });
    }
    return items;
}

const subscribedMovieIds = async () => (await getAllNotificationSubs().catch(() => []))
    .filter((s) => s.media_type === 'movie')
    .sort((a, b) => b.added_at.getTime() - a.added_at.getTime())
    .map((s) => s.tmdb_id);

/** Películas con «Avisarme»: estreno en cines, en digital y en tus plataformas (ver cabecera). */
export async function subscribedMovieSignals(platforms: number[]): Promise<TitleSignal[]> {
    const ids = (await subscribedMovieIds()).slice(0, MAX_SUBS_CHECKED);
    return movieSignals(ids, platforms, { origin: 'pediste aviso', behind: GRACE_DAYS, always: true });
}

/**
 * Películas de Ver pronto y Pendientes (N3): estreno en cines, en digital y llegada a tu plataforma.
 * Ver pronto se mira a diario (es lo que más ganas tienes de ver); Pendientes, en ronda semanal como
 * las series, así que el aviso puede llegar hasta 6 días después del estreno («En cines desde el
 * jueves»). «Ya en {plataforma}» solo si la película es reciente (digital en 90 días o cines en 180):
 * sin esa regla, una lista de pendientes recién hecha volcaría todo lo que ya estaba disponible.
 * Lo que entra o sale de plataforma en lo que no es reciente lo sigue cubriendo el diff diario.
 */
export async function watchlistMovieSignals(platforms: number[]): Promise<TitleSignal[]> {
    const [snap, subbed] = await Promise.all([getLibrarySnapshot(), subscribedMovieIds()]);
    const skip = new Set(subbed);
    const daily: string[] = [];
    const weekly: string[] = [];
    const turn = todayNum() % ROUND_DAYS;
    for (const m of snap.movVerPronto) { const id = String(m.id); if (!skip.has(id)) { daily.push(id); skip.add(id); } }
    for (const m of snap.movPend) { const id = String(m.id); if (!skip.has(id) && bucketOf(id) === turn) { weekly.push(id); skip.add(id); } }
    const [a, b] = await Promise.all([
        movieSignals(daily, platforms, { origin: 'de tu lista', behind: GRACE_DAYS, platformOnlyIfRecent: true }),
        movieSignals(weekly, platforms, { origin: 'de tu lista', behind: SEASON_BEHIND_DAYS, platformOnlyIfRecent: true }),
    ]);
    return [...a, ...b];
}
