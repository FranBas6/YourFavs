import { processBatch } from './processBatch';
import { tmdbFetch } from '../services/API/shared/tmdbClient';
import { getFirebaseTimestamp } from './constants/helpers/media-helpers';
import { appDateParts } from './appTime';
import { userCol, getCurrentUid } from '../services/BD/shared/userScope';
import { getLibrarySnapshot, type LibrarySnapshot } from '../services/BD/shared/librarySnapshot';
import {
    unionEpisodeWatches, watchLogInstant,
    type EpisodeWatch, type WatchLogRow,
} from '../services/BD/shared/episodeWatches';

const TTL_MS = 60 * 60 * 1000;
const FALLBACK_EPISODE_RUNTIME = 45;

export interface ItemShowcase {
    id: string;
    kind: 'movie' | 'tv';
    title: string;
    poster_path: string;
    tmdb_rating: number;
    user_rating?: number;
    addedAt: number;
}

export interface SeriesEpsRanking {
    id: string;
    title: string;
    poster_path: string;
    episodesWatched: number;
}

/**
 * Una tarjeta del mes a mes. Es un VISIONADO, no un título: la misma serie aparece en
 * cada mes en que viste algún episodio, y una peli revista sale otra vez en el mes del
 * nuevo pase.
 */
export interface TimelineEntry {
    id: string;
    kind: 'movie' | 'tv';
    title: string;
    poster_path: string;
    /** Primer visionado DENTRO del mes: es lo que ordena la fila. */
    startTs: number;
    /** Último visionado dentro del mes (si difiere de `startTs`, se pinta un rango). */
    endTs: number;
    /** Episodios vistos ESE mes. 0 en películas. */
    episodes: number;
    /** Ordinal del visionado de por vida: 2 = «2.ª vez». Ausente en el primero. */
    pass?: number;
}

export interface MonthTimeline {
    month: number;
    entries: TimelineEntry[];
    /** Desglose para la cabecera del mes, ya contado en servidor. */
    series: number;
    movies: number;
    episodes: number;
}

/** Ámbito del cálculo: un año concreto o 'all' (acumulado de por vida). */
export type StatsScope = number | 'all';

export interface YearStats {
    year: StatsScope;
    moviesAdded: number;
    seriesAdded: number;
    episodesWatched: number;
    rewatches: number;        // entradas del diario (WatchLog) marcadas como re-visionado
    totalHours: number;
    topGenres: { id: number; count: number }[];
    /**
     * El mes que más VISTE (del `timeline`), no el que más guardó en listas. `null` de por vida
     * (`scope='all'`), donde «el marzo de qué año» no significa nada.
     */
    activeMonth: { month: number; count: number; series: number; movies: number } | null;
    /** El día de la semana con más visionados (episodios + pases de película). */
    activeWeekday: { weekday: number; count: number } | null;
    /** ALTAS en listas por mes (`added_at`). Es la gráfica de barras, no el visionado. */
    monthlyBreakdown: number[];
    /** Mes a mes de lo que VISTE de verdad (series por episodio + pelis). Vacío si scope='all'. */
    timeline: MonthTimeline[];
    heatmap: { dayKey: string; count: number }[];
    byDecade: { decade: string; count: number }[];
    byCollection: { key: string; label: string; count: number }[];
    byLanguage: { code: string; count: number }[];
    showcase: {
        bestUserRated: ItemShowcase | null;
        bestTmdb: ItemShowcase | null;
        firstOfYear: ItemShowcase | null;
        lastOfYear: ItemShowcase | null;
        topSeries: SeriesEpsRanking[];
    };
    comparison: {
        moviesDelta: number | null;
        seriesDelta: number | null;
        episodesDelta: number | null;
    };
    /** 4.1 · Tu nota media frente a la de TMDB, sobre los títulos que has puntuado. */
    ratingCompare: { count: number; userAvg: number; tmdbAvg: number } | null;
    /** 4.1 · Directores (pelis) y creadores (series) más vistos en la biblioteca. */
    topDirectors: { id: number; name: string; profile_path: string | null; count: number }[];
    availableYears: number[];
    hasData: boolean;
}

/**
 * Clave `${uid}:${scope}`. Antes era solo el scope: en un proceso caliente de Netlify eso
 * podía servirle a un usuario las cifras de otro, y ahora que el objeto lleva títulos y
 * pósters de tu biblioteca el escape sería contenido, no solo números.
 */
const cache = new Map<string, { data: YearStats; expires: number }>();
function cacheKey(scope: StatsScope): string { return `${getCurrentUid() || 'anon'}:${scope}`; }

const COLLECTION_LABELS: Record<string, string> = {
    favs: 'Favoritos', siguiendo: 'Siguiendo', like: 'Me gusta',
    vistos: 'Vistos', pendientes: 'Pendientes', verpronto: 'Pronto',
};

function yearOf(timestamp: number): number { return appDateParts(timestamp).year; }
function monthOf(timestamp: number): number { return appDateParts(timestamp).month; }
function weekdayOf(timestamp: number): number { return appDateParts(timestamp).weekday; }
function dayKeyOf(ts: number): string { return appDateParts(ts).key; }
function decadeOf(year: number): string {
    if (!year || year < 1900) return 'Desconocido';
    return `${Math.floor(year / 10) * 10}s`;
}

interface RawItem {
    id: string;
    kind: 'movie' | 'tv';
    addedAt: number;
    collections: Set<string>;
    user_rating?: number;
}

function buildRawMap(groups: { items: any[]; key: string }[]): Map<string, RawItem> {
    const map = new Map<string, RawItem>();
    for (const { items, key } of groups) {
        for (const item of items) {
            const t = getFirebaseTimestamp(item.added_at);
            if (!t) continue;
            const cur = map.get(item.id);
            if (cur) {
                cur.collections.add(key);
                if (t < cur.addedAt) cur.addedAt = t;
                if (item.rating && (!cur.user_rating || item.rating > cur.user_rating)) {
                    cur.user_rating = item.rating;
                }
            } else {
                map.set(item.id, {
                    id: item.id,
                    kind: 'movie',
                    addedAt: t,
                    collections: new Set([key]),
                    user_rating: item.rating || undefined,
                });
            }
        }
    }
    return map;
}

/**
 * Título + póster de todo lo que hay en tus listas, sin pedirle nada a TMDB: los
 * documentos de lista ya los guardan. Es lo que permite que el mes a mes pinte pelis y
 * series a coste cero (antes hacía un `fetchSerieDetails` por serie del año).
 */
type TitleMeta = { title: string; poster_path: string };
function buildTitleIndex(s: LibrarySnapshot): Map<string, TitleMeta> {
    const idx = new Map<string, TitleMeta>();
    const add = (kind: 'movie' | 'tv', items: any[]) => {
        for (const it of items || []) {
            if (!it?.id) continue;
            const k = `${kind}:${it.id}`;
            const title = (kind === 'tv' ? it.name : it.title) || '';
            const poster = it.poster_path || '';
            const cur = idx.get(k);
            if (cur) {
                // Un título puede estar en varias listas y no todas las copias están igual
                // de completas (las viejas pueden no tener póster): se rellenan huecos.
                if (!cur.title && title) cur.title = title;
                if (!cur.poster_path && poster) cur.poster_path = poster;
                continue;
            }
            if (!title && !poster) continue;
            idx.set(k, { title, poster_path: poster });
        }
    };
    add('movie', s.movFavs); add('movie', s.movLike); add('movie', s.movVistos);
    add('movie', s.movPend); add('movie', s.movVerPronto);
    add('tv', s.tvFavs); add('tv', s.tvSig); add('tv', s.tvLike); add('tv', s.tvVistos);
    add('tv', s.tvPend); add('tv', s.tvVerPronto); add('tv', s.tvAbandonadas);
    return idx;
}

/**
 * Mes a mes de lo que viste de verdad.
 *
 * Una tarjeta es un VISIONADO, no un título: una serie sale en CADA mes en que viste algún
 * episodio (con los episodios de ese mes, no los del año), y una peli revista sale otra vez
 * en el mes de su nuevo pase. El criterio anterior colapsaba cada serie a un solo instante
 * al año —el de su último episodio—, así que una serie vista entre mayo y junio aparecía
 * solo en junio y con el recuento del año entero.
 */
function buildTimeline(
    year: number,
    watches: EpisodeWatch[],
    logRows: WatchLogRow[],
    /** `MoviesVistas`, para las pelis anteriores al diario (su única fecha es `added_at`). */
    moviesSeen: any[],
    titles: Map<string, TitleMeta>,
): MonthTimeline[] {
    const entries: TimelineEntry[] = [];

    // --- Series: un tramo por (serie, mes) ---
    const bySerieMonth = new Map<string, TimelineEntry>();
    for (const w of watches) {
        const p = appDateParts(w.ts);
        if (p.year !== year) continue;
        const k = `${w.serieId}:${p.month}`;
        const cur = bySerieMonth.get(k);
        if (cur) {
            cur.episodes++;
            if (w.ts < cur.startTs) cur.startTs = w.ts;
            if (w.ts > cur.endTs) cur.endTs = w.ts;
            continue;
        }
        const meta = titles.get(`tv:${w.serieId}`);
        bySerieMonth.set(k, {
            id: w.serieId, kind: 'tv',
            title: meta?.title || '', poster_path: meta?.poster_path || '',
            startTs: w.ts, endTs: w.ts, episodes: 1,
        });
    }

    // Pases de serie: cada fila de NIVEL SERIE del diario (sin season) es una pulsación de
    // "Vuelto a ver", que se registra al vaciar el progreso → marca el ARRANQUE de un pase.
    // La primera vez no deja marca, de ahí el +1.
    const passMarks = new Map<string, number[]>();
    for (const x of logRows) {
        if (x.media_type !== 'tv' || x.season != null) continue;
        const { ts } = watchLogInstant(x);
        if (!ts) continue;
        const id = String(x.tmdb_id);
        const arr = passMarks.get(id);
        if (arr) arr.push(ts); else passMarks.set(id, [ts]);
    }
    for (const e of bySerieMonth.values()) {
        const marks = passMarks.get(e.id);
        if (marks) {
            const before = marks.filter((t) => t <= e.endTs).length;
            if (before > 0) e.pass = before + 1;
        }
        entries.push(e);
    }

    // --- Películas: una tarjeta por pase ---
    // Cada fila del diario es un visionado. Se deduplica por día (un doble registro del
    // mismo día es el mismo visionado) y el orden de por vida da el ordinal del pase.
    const movieDays = new Map<string, Map<string, number>>();
    for (const x of logRows) {
        if (x.media_type !== 'movie') continue;
        const { ts } = watchLogInstant(x);
        if (!ts) continue;
        const id = String(x.tmdb_id);
        const day = x.watched_on || dayKeyOf(ts);
        let days = movieDays.get(id);
        if (!days) { days = new Map(); movieDays.set(id, days); }
        const prev = days.get(day);
        if (prev == null || ts < prev) days.set(day, ts);
    }
    for (const [id, days] of movieDays) {
        const meta = titles.get(`movie:${id}`);
        const passes = Array.from(days.values()).sort((a, b) => a - b);
        passes.forEach((ts, i) => {
            if (appDateParts(ts).year !== year) return;
            entries.push({
                id, kind: 'movie',
                title: meta?.title || '', poster_path: meta?.poster_path || '',
                startTs: ts, endTs: ts, episodes: 0,
                ...(i > 0 ? { pass: i + 1 } : {}),
            });
        });
    }

    // Respaldo: pelis marcadas como vistas antes de que el diario existiera. No tienen
    // ninguna fila, así que su única fecha es cuándo las marcaste.
    for (const m of moviesSeen || []) {
        const id = String(m?.id ?? '');
        if (!id || movieDays.has(id)) continue;
        const ts = getFirebaseTimestamp(m.added_at);
        if (!ts || appDateParts(ts).year !== year) continue;
        const meta = titles.get(`movie:${id}`);
        entries.push({
            id, kind: 'movie',
            title: m.title || meta?.title || '', poster_path: m.poster_path || meta?.poster_path || '',
            startTs: ts, endTs: ts, episodes: 0,
        });
    }

    // --- Agrupar por mes, en orden de visionado dentro de cada uno ---
    const months = new Map<number, TimelineEntry[]>();
    for (const e of entries) {
        const m = appDateParts(e.startTs).month;
        const arr = months.get(m);
        if (arr) arr.push(e); else months.set(m, [e]);
    }
    return Array.from(months.entries())
        .sort((a, b) => a[0] - b[0])   // enero arriba → diciembre abajo
        .map(([month, list]) => {
            list.sort((a, b) => a.startTs - b.startTs);
            return {
                month,
                entries: list,
                series: list.filter((e) => e.kind === 'tv').length,
                movies: list.filter((e) => e.kind === 'movie').length,
                episodes: list.reduce((s, e) => s + e.episodes, 0),
            };
        });
}

/** Acumulado de por vida: el mismo cálculo sin filtrar por año. */
export const calculateLifetimeStats = () => calculateYearStats('all');

export async function calculateYearStats(year: StatsScope): Promise<YearStats> {
    const now = Date.now();
    const key = cacheKey(year);
    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.data;

    // Lectura compartida de la biblioteca (dedupe de lecturas Firestore).
    const snapshot = await getLibrarySnapshot();
    const {
        movFavs, movPend, movVistos, movLike, movVerPronto,
        tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto,
    } = snapshot;

    const movieMap = buildRawMap([
        { items: movFavs, key: 'favs' },
        { items: movLike, key: 'like' },
        { items: movVistos, key: 'vistos' },
        { items: movPend, key: 'pendientes' },
        { items: movVerPronto, key: 'verpronto' },
    ]);
    for (const v of movieMap.values()) v.kind = 'movie';

    const tvMap = buildRawMap([
        { items: tvFavs, key: 'favs' },
        { items: tvSig, key: 'siguiendo' },
        { items: tvLike, key: 'like' },
        { items: tvVistos, key: 'vistos' },
        { items: tvPend, key: 'pendientes' },
        { items: tvVerPronto, key: 'verpronto' },
    ]);
    for (const v of tvMap.values()) v.kind = 'tv';

    const allYears = new Set<number>();
    const allRaw = [...movieMap.values(), ...tvMap.values()];
    for (const r of allRaw) allYears.add(yearOf(r.addedAt));

    // 'all' = sin filtro de año (y sin "año anterior" con el que comparar)
    const itemsOfYear = year === 'all' ? allRaw : allRaw.filter(r => yearOf(r.addedAt) === year);
    const itemsOfPrev = year === 'all' ? [] : allRaw.filter(r => yearOf(r.addedAt) === year - 1);

    // Fetch detalles TMDB para items del año
    const enriched = await processBatch(
        itemsOfYear,
        async (item: RawItem) => {
            try {
                const path = item.kind === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
                // append credits → directores/creadores SIN una petición extra (4.1)
                const d: any = await tmdbFetch<any>(path, { append_to_response: 'credits' });
                const releaseStr = item.kind === 'movie' ? d?.release_date : d?.first_air_date;
                const releaseYear = releaseStr ? Number(releaseStr.slice(0, 4)) : 0;
                const epRuntime = Array.isArray(d?.episode_run_time) && d.episode_run_time.length > 0
                    ? d.episode_run_time[0] : FALLBACK_EPISODE_RUNTIME;
                // Pelis: crew con job "Director". Series: created_by (el campo fiable para TV).
                const directors = item.kind === 'movie'
                    ? ((d?.credits?.crew || []) as any[])
                        .filter((c) => c.job === 'Director')
                        .map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path ?? null }))
                    : ((d?.created_by || []) as any[])
                        .map((c) => ({ id: c.id, name: c.name, profile_path: c.profile_path ?? null }));
                return {
                    raw: item,
                    title: (item.kind === 'movie' ? d?.title : d?.name) || '',
                    poster_path: d?.poster_path || '',
                    tmdb_rating: d?.vote_average || 0,
                    runtime: d?.runtime || 0,
                    episode_runtime: epRuntime,
                    release_year: releaseYear,
                    original_language: d?.original_language || '',
                    genres: ((d?.genres || []) as any[]).map(g => g.id as number),
                    directors,
                };
            } catch {
                return {
                    raw: item, title: '', poster_path: '', tmdb_rating: 0,
                    runtime: 0, episode_runtime: FALLBACK_EPISODE_RUNTIME,
                    release_year: 0, original_language: '', genres: [] as number[],
                    directors: [] as { id: number; name: string; profile_path: string | null }[],
                };
            }
        },
        10
    );

    /**
     * Altas en listas por mes: cuándo GUARDASTE cada cosa (`added_at`). Alimenta la gráfica de barras,
     * que se titula «Items añadidos por mes» y por tanto dice la verdad.
     *
     * Lo que ya NO sale de aquí es «tu mes más activo»: medía altas y se leía como visionado, así que
     * si guardabas 40 películas en enero y las veías en agosto, el tile decía enero. Ahora se deriva del
     * `timeline`, más abajo, cuando ya están leídos los visionados reales.
     */
    const monthlyBreakdown = new Array(12).fill(0);
    for (const e of enriched) {
        monthlyBreakdown[monthOf(e.raw.addedAt)]++;
    }

    // Top géneros
    const genreCount: Record<number, number> = {};
    for (const e of enriched) for (const g of e.genres) genreCount[g] = (genreCount[g] || 0) + 1;
    const topGenres = Object.entries(genreCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, count]) => ({ id: Number(id), count }));

    // By decade
    const decadeCount: Record<string, number> = {};
    for (const e of enriched) {
        const dec = decadeOf(e.release_year);
        decadeCount[dec] = (decadeCount[dec] || 0) + 1;
    }
    const byDecade = Object.entries(decadeCount)
        .sort(([a], [b]) => (b === 'Desconocido' ? -1 : a === 'Desconocido' ? 1 : Number(b.replace('s', '')) - Number(a.replace('s', ''))))
        .map(([decade, count]) => ({ decade, count }));

    // By collection. Modelo de 2 capas: Favoritos/Me gusta también viven en Vistas
    // (paraguas "consumido"), así que contamos "vistos" como "a secas" (excluyendo los
    // que tienen opinión) para que la distribución sean niveles y no se dupliquen.
    const collCount: Record<string, number> = {};
    for (const e of enriched) {
        const cols = e.raw.collections;
        const hasOpinion = cols.has('favs') || cols.has('like');
        for (const c of cols) {
            if (c === 'vistos' && hasOpinion) continue;
            collCount[c] = (collCount[c] || 0) + 1;
        }
    }
    const byCollection = Object.entries(collCount)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => ({ key, label: COLLECTION_LABELS[key] || key, count }));

    // By language
    const langCount: Record<string, number> = {};
    for (const e of enriched) {
        if (e.original_language) langCount[e.original_language] = (langCount[e.original_language] || 0) + 1;
    }
    const byLanguage = Object.entries(langCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }));

    // Visionados: UNA lectura de cada colección y de ahí sale TODO lo temporal — episodios,
    // heatmap, top series, revisionados y el mes a mes. Antes `WatchedEpisodes` se leía aquí
    // y otra vez en la página (vía `getSeriesActivityByYear`), y el diario solo servía para
    // contar revisionados.
    const heatmapMap = new Map<string, number>();
    const seriesEpsCount = new Map<string, number>();
    let episodesWatched = 0;
    let episodesPrev = 0;
    let hoursFromEpisodes = 0;
    let watches: EpisodeWatch[] = [];
    let logRows: WatchLogRow[] = [];
    try {
        if (getCurrentUid()) {
            const [watchedSnap, logSnap] = await Promise.all([
                userCol('WatchedEpisodes').get(),
                userCol('WatchLog').get(),
            ]);
            watches = unionEpisodeWatches(watchedSnap.docs, logSnap.docs);
            logRows = logSnap.docs.map((d) => d.data() as WatchLogRow);
        }
    } catch (error) {
        console.error('Error leyendo visionados (WatchedEpisodes + WatchLog):', error);
    }
    // `watches` ya viene deduplicado por (serie, episodio, día), así que un episodio visto
    // en dos pases distintos cuenta dos veces — que es lo que se vio.
    for (const w of watches) {
        const y = yearOf(w.ts);
        if (year === 'all' || y === year) {
            episodesWatched++;
            const k = dayKeyOf(w.ts);
            heatmapMap.set(k, (heatmapMap.get(k) || 0) + 1);
            seriesEpsCount.set(w.serieId, (seriesEpsCount.get(w.serieId) || 0) + 1);
        } else if (y === year - 1) {
            episodesPrev++;
        }
    }
    const heatmap = Array.from(heatmapMap.entries()).map(([dayKey, count]) => ({ dayKey, count }));

    // Mes a mes. Solo para un año concreto: de por vida no significa nada (¿el marzo de qué?).
    const timeline = year === 'all'
        ? []
        : buildTimeline(year, watches, logRows, movVistos, buildTitleIndex(snapshot));

    /**
     * «Tu mes más activo» y «tu día de la semana» salen del VISIONADO REAL, no de las altas en listas.
     *
     * El mes se saca del `timeline`, que ya reparte cada serie por los meses en que viste algo de ella y
     * cada pase de película por su fecha del diario. El día de la semana se cuenta sobre los instantes de
     * visionado: cada episodio y cada pase de película, que es lo que mide «cuándo veo cosas» (una tanda
     * de seis episodios un domingo pesa seis, y eso es correcto: es lo que se vio).
     */
    let activeMonth: { month: number; count: number; series: number; movies: number } | null = null;
    for (const m of timeline) {
        const count = m.entries.length;
        if (count > 0 && (!activeMonth || count > activeMonth.count)) {
            activeMonth = { month: m.month, count, series: m.series, movies: m.movies };
        }
    }

    const weekdayBreakdown = new Array(7).fill(0);
    const inScope = (ts: number) => !!ts && !isNaN(ts) && (year === 'all' || yearOf(ts) === year);
    for (const w of watches) {
        if (inScope(w.ts)) weekdayBreakdown[weekdayOf(w.ts)]++;
    }
    for (const row of logRows) {
        if (row.media_type !== 'movie') continue;
        const { ts } = watchLogInstant(row);
        if (inScope(ts)) weekdayBreakdown[weekdayOf(ts)]++;
    }
    let activeWeekday: { weekday: number; count: number } | null = null;
    for (let w = 0; w < 7; w++) {
        if (!activeWeekday || weekdayBreakdown[w] > activeWeekday.count) {
            activeWeekday = { weekday: w, count: weekdayBreakdown[w] };
        }
    }
    if (activeWeekday && activeWeekday.count === 0) activeWeekday = null;

    // Horas: runtime de movies del año + (eps × episode_runtime medio por serie del año)
    let hoursFromMovies = 0;
    const enrichedById = new Map<string, typeof enriched[number]>();
    for (const e of enriched) {
        enrichedById.set(e.raw.id, e);
        if (e.raw.kind === 'movie' && e.runtime > 0) hoursFromMovies += e.runtime;
    }
    // Residuo del mes a mes: lo que viste y ya no está en NINGUNA lista no tiene título ni
    // póster en el snapshot. Primero se busca entre los detalles que ya tenemos y solo lo que
    // siga huérfano va a TMDB — en una biblioteca normal, nada.
    const orphans = new Map<string, TimelineEntry[]>();
    for (const m of timeline) {
        for (const e of m.entries) {
            if (e.title) continue;
            const known = enrichedById.get(e.id);
            if (known?.title) { e.title = known.title; e.poster_path = known.poster_path; continue; }
            const k = `${e.kind}:${e.id}`;
            const arr = orphans.get(k);
            if (arr) arr.push(e); else orphans.set(k, [e]);
        }
    }
    if (orphans.size > 0) {
        await processBatch(Array.from(orphans.keys()), async (k: string) => {
            const sep = k.indexOf(':');
            const kind = k.slice(0, sep);
            const id = k.slice(sep + 1);
            try {
                const d: any = await tmdbFetch<any>(kind === 'movie' ? `/movie/${id}` : `/tv/${id}`);
                const title = (kind === 'movie' ? d?.title : d?.name) || '';
                const poster = d?.poster_path || '';
                for (const e of orphans.get(k) || []) { e.title = title; e.poster_path = poster; }
            } catch { /* sin título: la tarjeta sigue enlazando a su ficha */ }
            return null;
        }, 10);
    }

    // Para series, usamos eps vistos en el año × runtime medio (de los detalles que ya tenemos)
    for (const [serieId, eps] of seriesEpsCount.entries()) {
        const detail = enrichedById.get(serieId);
        const runtime = detail?.episode_runtime || FALLBACK_EPISODE_RUNTIME;
        hoursFromEpisodes += eps * runtime;
    }
    const totalHours = Math.round((hoursFromMovies + hoursFromEpisodes) / 60);

    // Top series por eps vistos en el año (top 5)
    const topSeriesRaw = Array.from(seriesEpsCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
    const missingIds = topSeriesRaw
        .map(([id]) => id)
        .filter(id => !enrichedById.has(id));
    const extraDetails = await processBatch(
        missingIds,
        async (id: string) => {
            try {
                const d: any = await tmdbFetch<any>(`/tv/${id}`);
                return { id, title: d?.name || '', poster_path: d?.poster_path || '' };
            } catch {
                return { id, title: '', poster_path: '' };
            }
        },
        10
    );
    const extraById = new Map(extraDetails.map(e => [e.id, e]));
    const topSeries: SeriesEpsRanking[] = topSeriesRaw.map(([serieId, eps]) => {
        const detail = enrichedById.get(serieId);
        const extra = extraById.get(serieId);
        return {
            id: serieId,
            title: detail?.title || extra?.title || `Serie ${serieId}`,
            poster_path: detail?.poster_path || extra?.poster_path || '',
            episodesWatched: eps,
        };
    });

    // Showcase
    const toShowcase = (e: typeof enriched[number]): ItemShowcase => ({
        id: e.raw.id, kind: e.raw.kind, title: e.title,
        poster_path: e.poster_path, tmdb_rating: e.tmdb_rating,
        user_rating: e.raw.user_rating, addedAt: e.raw.addedAt,
    });
    const enrichedSorted = [...enriched].sort((a, b) => a.raw.addedAt - b.raw.addedAt);
    const enrichedWithUserRating = enriched.filter(e => e.raw.user_rating && e.raw.user_rating > 0);
    const bestUserRated = enrichedWithUserRating.length
        ? toShowcase([...enrichedWithUserRating].sort((a, b) => (b.raw.user_rating || 0) - (a.raw.user_rating || 0))[0])
        : null;
    const enrichedWithTmdb = enriched.filter(e => e.tmdb_rating > 0);
    const bestTmdb = enrichedWithTmdb.length
        ? toShowcase([...enrichedWithTmdb].sort((a, b) => b.tmdb_rating - a.tmdb_rating)[0])
        : null;
    const firstOfYear = enrichedSorted.length ? toShowcase(enrichedSorted[0]) : null;
    const lastOfYear = enrichedSorted.length ? toShowcase(enrichedSorted[enrichedSorted.length - 1]) : null;

    // 4.1 · Tu nota media vs TMDB (solo títulos que TÚ has puntuado, comparados
    // contra la nota TMDB de ESOS mismos títulos → comparación justa).
    const ratedItems = enriched.filter(e => (e.raw.user_rating || 0) > 0 && e.tmdb_rating > 0);
    const ratingCompare = ratedItems.length > 0
        ? {
            count: ratedItems.length,
            userAvg: Math.round((ratedItems.reduce((s, e) => s + (e.raw.user_rating || 0), 0) / ratedItems.length) * 10) / 10,
            tmdbAvg: Math.round((ratedItems.reduce((s, e) => s + e.tmdb_rating, 0) / ratedItems.length) * 10) / 10,
        }
        : null;

    // 4.1 · Director (pelis) / creador (series) más visto. Se exige ≥2 para que
    // "más visto" sea significativo; top 3.
    const dirCounter = new Map<number, { id: number; name: string; profile_path: string | null; count: number }>();
    for (const e of enriched) {
        for (const dir of e.directors) {
            if (!dir.id) continue;
            const cur = dirCounter.get(dir.id);
            if (cur) cur.count++;
            else dirCounter.set(dir.id, { id: dir.id, name: dir.name, profile_path: dir.profile_path, count: 1 });
        }
    }
    const topDirectors = Array.from(dirCounter.values())
        .filter(d => d.count >= 2)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 3);

    // Comparison
    const moviesPrev = itemsOfPrev.filter(r => r.kind === 'movie').length;
    const seriesPrev = itemsOfPrev.filter(r => r.kind === 'tv').length;
    const moviesAdded = itemsOfYear.filter(r => r.kind === 'movie').length;
    const seriesAdded = itemsOfYear.filter(r => r.kind === 'tv').length;
    const pctDelta = (cur: number, prev: number): number | null => {
        if (prev === 0) return cur > 0 ? null : null;
        return Math.round(((cur - prev) / prev) * 100);
    };

    // Re-visionados del año: entradas del diario con rewatch=true. Reutiliza `logRows`
    // (el diario ya se leyó arriba para los visionados) en vez de volver a la colección.
    let rewatches = 0;
    for (const x of logRows) {
        if (!x.rewatch || !x.watched_on) continue;
        if (year === 'all' || x.watched_on.slice(0, 4) === String(year)) rewatches++;
    }

    const data: YearStats = {
        year,
        moviesAdded,
        seriesAdded,
        episodesWatched,
        rewatches,
        totalHours,
        topGenres,
        activeMonth,
        activeWeekday,
        monthlyBreakdown,
        timeline,
        heatmap,
        byDecade,
        byCollection,
        byLanguage,
        showcase: { bestUserRated, bestTmdb, firstOfYear, lastOfYear, topSeries },
        comparison: {
            moviesDelta: pctDelta(moviesAdded, moviesPrev),
            seriesDelta: pctDelta(seriesAdded, seriesPrev),
            episodesDelta: pctDelta(episodesWatched, episodesPrev),
        },
        ratingCompare,
        topDirectors,
        availableYears: Array.from(allYears).sort((a, b) => b - a),
        hasData: moviesAdded + seriesAdded + episodesWatched > 0,
    };

    cache.set(key, { data, expires: now + TTL_MS });
    return data;
}

/** Tira lo cacheado del usuario actual (no el de todos: la clave lleva uid). */
export function invalidateYearStatsCache() {
    const uid = getCurrentUid();
    if (!uid) { cache.clear(); return; }
    for (const k of cache.keys()) if (k.startsWith(`${uid}:`)) cache.delete(k);
}
