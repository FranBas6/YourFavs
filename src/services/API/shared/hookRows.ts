/**
 * «Enganchan desde el primer episodio»: series cuyo piloto destaca.
 *
 * Es la única fila de la portada que NO se puede resolver en tiempo de request: hace falta la nota del
 * piloto de cada serie candidata, y eso es una llamada a TMDB **por serie**. Cien candidatas son cien
 * llamadas. Así que se precalcula en un documento GLOBAL (`homeRows/hooks`) y la portada solo lo lee y
 * lo filtra en memoria: coste cero por visita.
 *
 * Sin cron, porque este proyecto no tiene ninguno (`netlify/functions/` no existe). Dos vías:
 *   · `scripts/build-hook-rows.mjs` — barrido manual que siembra el fondo de armario de golpe.
 *   · `ensureHooksFresh()` — recarga incremental *on-open* de UNA página de discover (20 llamadas),
 *     con el mismo patrón de guard que `syncNotifications` **más un claim transaccional**, que es lo
 *     que le falta al original para que dos arranques en frío no recalculen a la vez.
 *
 * Una llamada por candidata, no dos: `/tv/{id}?append_to_response=season/1,watch/providers` devuelve
 * la nota de la serie, los géneros, el póster, el fotograma y la duración del piloto, TODA la primera
 * temporada y los proveedores por región. Verificado.
 */
import { claimAppState, readAppState, releaseAppState, writeAppState } from './appState';
import { tmdbFetch } from './tmdbClient';
import { processBatch } from '../../../utils/processBatch';

/** Página de `/discover/tv` que se procesa en cada recarga incremental. */
const CANDIDATES_PER_RUN = 1;
/** Cada cuánto se considera viejo el documento. El catálogo de series buenas no cambia a diario. */
export const HOOKS_TTL_MS = 24 * 60 * 60 * 1000;
/** Ventana del claim: si otra instancia lo cogió hace menos de esto, no lo tocamos. */
const CLAIM_TTL_MS = 5 * 60 * 1000;
/** Cuántos ítems guarda el documento como máximo (los mejores por margen). */
const MAX_ITEMS = 120;
/** Última página de discover que tiene sentido barrer (más allá el fondo es ruido). */
const LAST_PAGE = 25;

/**
 * Qué se entiende por «engancha». Los tres se pueden calcular con los MISMOS datos que ya se guardan,
 * así que cambiar de vara es esta línea (y volver a sembrar solo si se cambia a/desde `start3`).
 *
 *   `start3`   — ACTIVO. Los tres primeros episodios, todos por encima de 8. Es la única vara cuyo
 *                significado coincide con lo que promete la fila: no que tenga un buen primer capítulo,
 *                sino que **no te deje tirado al tercero**.
 *   `series`   — el criterio original del handoff: el piloto supera la nota media de la SERIE.
 *   `season1`  — el piloto supera la media de su propia primera temporada.
 *
 * Medido sobre la misma muestra de 120 series: `start3` deja 18 y saca Chernobyl, Arcane, True
 * Detective, **Breaking Bad y Better Call Saul** (que solo aparecen con esta vara); `series` deja 12 y
 * `season1` 16. El problema de las dos comparativas es que miden **caída**: premian a la serie cuyo
 * piloto destaca *porque el resto es mediocre*, y por eso una secuela de El bebé jefazo encabezaba la
 * fila. Se conservan por si se quiere volver a comparar.
 */
export const HOOK_BASELINE: 'start3' | 'series' | 'season1' = 'start3';

/** Umbrales del criterio, comunes a las tres varas. */
export const HOOK_MIN_PILOT_VOTE = 8.0;
export const HOOK_MIN_PILOT_VOTES = 50;
/** Nota mínima que tienen que superar los TRES primeros episodios con la vara `start3`. */
export const HOOK_MIN_START3 = 8.0;
/** Episodios de la T1 (sin contar el piloto) que hacen falta para que su media signifique algo. */
const MIN_S1_SAMPLE = 3;
const MIN_EPISODE_VOTES = 20;

export interface HookItem {
    id: number;
    name: string;
    genreIds: number[];
    posterPath: string | null;
    backdropPath: string | null;
    seriesVote: number;
    /** Media de la T1 sin el piloto. `null` si no hay episodios con votos suficientes. */
    s1Mean: number | null;
    /**
     * La nota del PEOR de los tres primeros episodios. Es la vara activa: cuanto más alta, más sólido
     * el arranque. `null` si E1-E3 no tienen votos suficientes para fiarse.
     */
    first3Min: number | null;
    pilotName: string;
    pilotVote: number;
    pilotVotes: number;
    pilotRuntime: number | null;
    pilotStill: string | null;
    marginSeries: number;
    /** `null` cuando no se pudo calcular la media de la T1. */
    marginS1: number | null;
    /**
     * Proveedores de streaming por región, solo las regiones que el job haya visitado (en la práctica
     * la del perfil que lo disparó). Si falta la del usuario, la fila no puede filtrar por plataforma
     * y lo dice en el subtítulo en vez de fingir.
     */
    providers: Record<string, number[]>;
}

export interface HooksDoc {
    updatedAt: number;
    /** Siguiente página de `/discover/tv` que le toca a la recarga incremental. */
    cursorPage: number;
    /** Instante en que una instancia reclamó el recálculo (para que no lo hagan dos a la vez). */
    claimedAt?: number;
    items: HookItem[];
}

const KEY = 'hooks'; // app_state (antes homeRows/hooks)

/** L1: en un proceso caliente evita releer el documento en cada render de la portada. */
let l1: { data: HooksDoc; expires: number } | null = null;
const L1_TTL_MS = 5 * 60 * 1000;

/** El margen de la vara comparativa activa. `null` con `start3`, que no compara. */
export function hookMargin(item: HookItem): number | null {
    if (HOOK_BASELINE === 'series') return item.marginSeries;
    if (HOOK_BASELINE === 'season1') return item.marginS1;
    return null;
}

/** ¿Cumple el criterio activo? */
export function hookQualifies(item: HookItem): boolean {
    if (item.pilotVote < HOOK_MIN_PILOT_VOTE || item.pilotVotes < HOOK_MIN_PILOT_VOTES) return false;
    if (HOOK_BASELINE === 'start3') return item.first3Min !== null && item.first3Min >= HOOK_MIN_START3;
    const m = hookMargin(item);
    return m !== null && m > 0;
}

/**
 * Cómo se ordena la fila. Con `start3` manda el peor de los tres primeros (el arranque más sólido
 * primero), y desempata la nota del piloto; con las comparativas, el margen.
 */
export function hookSortKey(item: HookItem): number {
    if (HOOK_BASELINE === 'start3') return (item.first3Min ?? -9) * 100 + item.pilotVote;
    return hookMargin(item) ?? -9;
}

// ---------------------------------------------------------------- lectura

export async function readHooksDoc(): Promise<HooksDoc | null> {
    const now = Date.now();
    if (l1 && l1.expires > now) return l1.data;
    try {
        const data = await readAppState<HooksDoc>(KEY);
        if (!data) return null;
        l1 = { data, expires: now + L1_TTL_MS };
        return data;
    } catch (err) {
        console.warn('[hookRows] no se pudo leer app_state/hooks:', (err as Error).message);
        return null;
    }
}

export interface HookRowResult {
    items: HookItem[];
    updatedAt: number;
    /** `true` si hubo que rellenar sin filtrar por plataforma (el subtítulo lo advierte). */
    relaxedPlatforms: boolean;
}

/**
 * La fila lista para pintar: se filtra en MEMORIA a partir del documento global.
 *
 * Si el filtro por plataformas deja menos de `MIN_ROW` se rellena con los mejores sin filtrar, y el
 * llamante avisa en el subtítulo. Nunca se enseña una fila con dos tarjetas.
 */
export function buildHookRow(
    doc: HooksDoc | null,
    opts: { platforms?: number[]; region?: string; excludeIds?: Set<number>; limit?: number } = {},
): HookRowResult | null {
    if (!doc?.items?.length) return null;
    const limit = opts.limit ?? 12;
    const MIN_ROW = 4;
    const region = opts.region || 'ES';
    const exclude = opts.excludeIds ?? new Set<number>();

    const eligible = doc.items
        .filter((it) => hookQualifies(it) && !exclude.has(it.id))
        .sort((a, b) => hookSortKey(b) - hookSortKey(a));
    if (!eligible.length) return null;

    let relaxedPlatforms = false;
    let items = eligible;
    if (opts.platforms?.length) {
        const mine = new Set(opts.platforms);
        const onMine = eligible.filter((it) => (it.providers?.[region] || []).some((p) => mine.has(p)));
        if (onMine.length >= MIN_ROW) {
            items = onMine;
        } else {
            // Menos de 4 en tus plataformas: se rellena con el resto, pero se dice.
            relaxedPlatforms = true;
        }
    }

    return { items: items.slice(0, limit), updatedAt: doc.updatedAt || 0, relaxedPlatforms };
}

// ---------------------------------------------------------------- cálculo

interface TmdbEpisode {
    episode_number: number;
    name?: string;
    vote_average?: number;
    vote_count?: number;
    runtime?: number | null;
    still_path?: string | null;
}

interface TmdbSeriesDetail {
    id: number;
    name?: string;
    vote_average?: number;
    genres?: { id: number }[];
    poster_path?: string | null;
    backdrop_path?: string | null;
    'season/1'?: { episodes?: TmdbEpisode[] };
    'watch/providers'?: { results?: Record<string, { flatrate?: { provider_id: number }[] }> };
}

/** Una candidata → un `HookItem`, o `null` si no cumple el criterio (con ninguna de las dos varas). */
export function hookItemFrom(detail: TmdbSeriesDetail, regions: string[]): HookItem | null {
    const eps = detail['season/1']?.episodes || [];
    const pilot = eps.find((e) => e.episode_number === 1) || eps[0];
    if (!pilot?.vote_average || !pilot.vote_count) return null;
    if (pilot.vote_average < HOOK_MIN_PILOT_VOTE || pilot.vote_count < HOOK_MIN_PILOT_VOTES) return null;

    const seriesVote = detail.vote_average ?? 0;
    if (!seriesVote) return null;

    const others = eps.filter(
        (e) => e.episode_number !== pilot.episode_number && (e.vote_count ?? 0) >= MIN_EPISODE_VOTES && (e.vote_average ?? 0) > 0,
    );
    const s1Mean = others.length >= MIN_S1_SAMPLE
        ? others.reduce((a, e) => a + (e.vote_average ?? 0), 0) / others.length
        : null;

    // Los tres primeros: hacen falta los TRES con votos suficientes, o no se puede afirmar nada.
    const first3 = eps.filter((e) => e.episode_number <= 3 && (e.vote_count ?? 0) >= MIN_EPISODE_VOTES && (e.vote_average ?? 0) > 0);
    const first3Min = first3.length >= 3 ? round2(Math.min(...first3.map((e) => e.vote_average ?? 0))) : null;

    const marginSeries = round2(pilot.vote_average - seriesVote);
    const marginS1 = s1Mean === null ? null : round2(pilot.vote_average - s1Mean);
    // Se guarda si pasa CUALQUIERA de las tres varas: así cambiar `HOOK_BASELINE` no exige re-barrer.
    const passesStart3 = first3Min !== null && first3Min >= HOOK_MIN_START3;
    if (!passesStart3 && marginSeries <= 0 && (marginS1 === null || marginS1 <= 0)) return null;

    const providers: Record<string, number[]> = {};
    const results = detail['watch/providers']?.results || {};
    for (const r of regions) {
        const ids = (results[r]?.flatrate || []).map((p) => p.provider_id);
        if (ids.length) providers[r] = ids;
    }

    return {
        id: detail.id,
        name: detail.name || '',
        genreIds: (detail.genres || []).map((g) => g.id),
        posterPath: detail.poster_path ?? null,
        backdropPath: detail.backdrop_path ?? null,
        seriesVote: round2(seriesVote),
        s1Mean: s1Mean === null ? null : round2(s1Mean),
        first3Min,
        pilotName: pilot.name || 'Piloto',
        pilotVote: round2(pilot.vote_average),
        pilotVotes: pilot.vote_count,
        pilotRuntime: pilot.runtime ?? null,
        pilotStill: pilot.still_path ?? null,
        marginSeries,
        marginS1,
        providers,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Candidatas de una página. `vote_count.desc` a propósito: ver la nota de `LAST_PAGE`. */
async function fetchCandidatePage(page: number): Promise<number[]> {
    const data = await tmdbFetch<{ results?: { id: number }[] }>('/discover/tv', {
        sort_by: 'vote_count.desc',
        'vote_count.gte': '200',
        page: String(page),
    });
    return (data.results || []).map((r) => r.id);
}

async function fetchSeriesDetail(id: number): Promise<TmdbSeriesDetail | null> {
    try {
        return await tmdbFetch<TmdbSeriesDetail>(`/tv/${id}`, {
            append_to_response: 'season/1,watch/providers',
        });
    } catch {
        return null;
    }
}

/**
 * Procesa `pages` páginas de candidatas y devuelve los ítems que cumplen. Lo comparten el script de
 * siembra y la recarga incremental.
 */
export async function collectHookItems(pages: number[], regions: string[]): Promise<HookItem[]> {
    const ids: number[] = [];
    for (const p of pages) {
        try { ids.push(...(await fetchCandidatePage(p))); } catch { /* una página que falla no aborta */ }
    }
    const details = await processBatch(ids, (id) => fetchSeriesDetail(id), 8);
    return details
        .map((d) => (d ? hookItemFrom(d, regions) : null))
        .filter((x): x is HookItem => x !== null);
}

/** Mezcla ítems nuevos con los guardados: gana el nuevo (datos más frescos) y se corta a `MAX_ITEMS`. */
export function mergeHookItems(existing: HookItem[], fresh: HookItem[]): HookItem[] {
    const byId = new Map<number, HookItem>();
    for (const it of existing) byId.set(it.id, it);
    for (const it of fresh) byId.set(it.id, it);
    // Se ordena por la vara ACTIVA para que el recorte a `MAX_ITEMS` no tire justo lo que se pinta.
    return [...byId.values()]
        .sort((a, b) => hookSortKey(b) - hookSortKey(a))
        .slice(0, MAX_ITEMS);
}

/**
 * Recarga incremental *on-open*: si el documento está viejo y nadie lo ha reclamado, procesa una
 * página de candidatas y la fusiona.
 *
 * El claim es atómico (`claim_app_state`, un UPDATE condicional) porque el guard del patrón original
 * (un `Map` en memoria más un campo persistido) no protege de dos Lambdas arrancando a la vez: las
 * dos leerían "viejo" y las dos recalcularían. Aquí solo una se lleva el claim.
 *
 * Devuelve `true` si ha hecho trabajo.
 */
export async function ensureHooksFresh(regions: string[] = ['ES']): Promise<boolean> {
    const now = Date.now();
    const isFresh = (d: HooksDoc | null) => Boolean(d?.updatedAt && now - d.updatedAt < HOOKS_TTL_MS);

    let cursorPage = 1;
    let existing: HookItem[] = [];
    try {
        // Lectura previa: el caso normal (fresco) sale aquí sin tocar el cerrojo.
        if (isFresh(await readAppState<HooksDoc>(KEY))) return false;
        const claimed = await claimAppState<HooksDoc>(KEY, CLAIM_TTL_MS);
        if (claimed === false) return false; // otra instancia lo está recalculando
        // Entre la lectura y el claim otra instancia pudo terminar: si ya está fresco, se suelta.
        if (isFresh(claimed)) { await releaseAppState(KEY); return false; }
        cursorPage = claimed?.cursorPage && claimed.cursorPage <= LAST_PAGE ? claimed.cursorPage : 1;
        existing = claimed?.items || [];
    } catch (err) {
        console.warn('[hookRows] claim falló:', (err as Error).message);
        return false;
    }

    try {
        const pages = Array.from({ length: CANDIDATES_PER_RUN }, (_, i) => cursorPage + i)
            .filter((p) => p <= LAST_PAGE);
        const fresh = await collectHookItems(pages, regions);
        const nextPage = cursorPage + pages.length > LAST_PAGE ? 1 : cursorPage + pages.length;
        await writeAppState(KEY, {
            updatedAt: Date.now(),
            cursorPage: nextPage,
            items: mergeHookItems(existing, fresh),
        } satisfies HooksDoc);
        l1 = null; // el documento cambió: la caché de proceso ya no vale
        console.log(`[hookRows] recarga: página ${cursorPage}, ${fresh.length} nuevas`);
        return true;
    } catch (err) {
        // Liberar el claim para que el siguiente lo pueda intentar, y dejar el documento como estaba.
        console.warn('[hookRows] recarga falló:', (err as Error).message);
        await releaseAppState(KEY).catch(() => {});
        return false;
    }
}
