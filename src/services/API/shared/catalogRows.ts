/**
 * Trae las filas de la portada del catálogo (`/catalogo`).
 *
 * Por qué con caché: la portada pinta hasta ~9 filas y cada una es una llamada a discover, así que
 * sin caché costaría eso EN CADA VISITA. Son datos públicos de TMDB e iguales para todo el mundo con
 * la misma región y plataformas, así que se comparten (a diferencia de las cachés de `utils/`, que
 * van por uid porque guardan tu biblioteca).
 *
 * Se cachea SOLO cuando no hay filtros del usuario: con filtros las combinaciones son infinitas y
 * cachearlas llenaría el almacén de entradas de un solo uso.
 */
import { discoverContent, type AdvancedFilters } from './tmdbDiscoverService';
import { getCached, setCached } from '../../../utils/recsBlobCache';
import { appDateParts } from '../../../utils/appTime';
import { resolveProviderNames } from './watchProviders';
import type { Movie } from '../../../types/ApiMovie';
import type { Serie } from '../../../types/ApiSerie';
import type { CatalogRowDef } from '../../../utils/constants/catalogRows';

/** 6 h: el catálogo de TMDB no cambia en una tarde, y así la portada es barata. */
const L2_TTL_MS = 6 * 60 * 60 * 1000;
const L1_TTL_MS = 30 * 60 * 1000;

const l1 = new Map<string, { data: unknown[]; expires: number }>();

/**
 * Quita repetidos de la misma saga dentro de una fila.
 *
 * Hace falta porque cualquier orden de TMDB agrupa franquicias: «Para ver con palomitas» devolvía
 * cuatro Vengadores seguidos, y ordenada por nota, la trilogía entera de El señor de los anillos. Una
 * fila con la misma saga cuatro veces no está recomendando, está repitiendo.
 *
 * La clave es el título antes de los dos puntos, que es como TMDB nombra las sagas
 * («Vengadores: Endgame», «Spider-Man: No Way Home», «Gabriel's Inferno: Part II»). No pilla
 * «The Amazing Spider-Man» frente a «Spider-Man: …», pero sí el agrupamiento que se ve.
 * También la usa «Para ti» (`personalRecommendations.ts`).
 */
export function dedupeFranchises<T extends { title?: string; name?: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const it of items) {
        const full = (it.title || it.name || '').trim();
        const key = full.split(':')[0].trim().toLowerCase() || full.toLowerCase();
        if (!key) { out.push(it); continue; }
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
    }
    return out;
}

/** `_platform`: la plataforma tuya donde está (solo tras `markRowPlatforms`). */
type Marked<T> = T & { _platform?: string };

export interface CatalogRowResult {
    def: CatalogRowDef;
    movies: Marked<Movie>[];
    series: Marked<Serie>[];
}

interface FetchContext {
    filters: AdvancedFilters;
    /** `with_watch_providers` ya unido por `|`, o '' si el filtro no está activo. */
    providers: string;
    region: string;
    /** Con filtros activos no se cachea (ver cabecera). */
    cacheable: boolean;
    /** Página de TMDB. La usa la vista ampliada de una fila (`/catalogo/fila/{clave}`). */
    page?: string;
}

/**
 * Sube esto al cambiar el criterio de cualquier fila (params, orden, ventanas de votos, dedupe): si
 * no, las entradas guardadas siguen sirviendo el criterio viejo hasta que caduquen. Es el mismo
 * patrón que `personalRecs_v8` / `genrePrefs_v5`.
 *
 * Ojo, aprendido a base de despistarse: el adaptador de Netlify **emula los blobs también en
 * `astro dev`**, así que esta caché está viva en local y reiniciar el servidor NO la limpia.
 */
const CACHE_VERSION = 'v4';

function cacheKey(rowKey: string, media: 'movie' | 'tv', ctx: FetchContext): string {
    const day = appDateParts(Date.now()).key;
    // Las plataformas entran en la clave: la misma fila filtrada a Netflix no es la misma fila.
    // Y la página, obviamente: la 2 no es la 1.
    const page = ctx.page && ctx.page !== '1' ? `_p${ctx.page}` : '';
    return `catalogRow_${CACHE_VERSION}_${rowKey}_${media}_${ctx.region}_${ctx.providers || 'nofilter'}${page}_${day}`;
}

async function fetchOne<T>(
    def: CatalogRowDef,
    media: 'movie' | 'tv',
    ctx: FetchContext,
): Promise<T[]> {
    const key = cacheKey(def.key, media, ctx);
    const now = Date.now();

    if (ctx.cacheable) {
        const hitL1 = l1.get(key);
        if (hitL1 && hitL1.expires > now) return hitL1.data as T[];
        const hitL2 = await getCached<T[]>(key);
        if (hitL2) {
            l1.set(key, { data: hitL2, expires: now + L1_TTL_MS });
            return hitL2;
        }
    }

    const raw = await discoverContent<T>(media, ctx.filters, {
        sort_by: def.sortBy,
        voteCountMin: def.voteCountMin,
        page: ctx.page,
        providers: ctx.providers,
        region: ctx.region,
        extraParams: { ...def.params, ...(media === 'movie' ? def.movieParams : def.tvParams) },
    });
    // TMDB devuelve 20 por página y la fila pinta 10, así que quitar sagas repetidas no deja hueco.
    const data = dedupeFranchises(raw as { title?: string; name?: string }[]) as T[];

    if (ctx.cacheable) {
        l1.set(key, { data, expires: now + L1_TTL_MS });
        void setCached(key, data, L2_TTL_MS);
    }
    return data;
}

/**
 * Resuelve una fila. Devuelve `null` si sale vacía: **una fila sin resultados no se pinta**, ni con
 * mensaje de "no hay nada" ni con esqueleto eterno.
 */
export async function fetchCatalogRow(def: CatalogRowDef, ctx: FetchContext): Promise<CatalogRowResult | null> {
    try {
        const wantMovies = def.media === 'movie' || def.media === 'both';
        const wantSeries = def.media === 'tv' || def.media === 'both';
        const [movies, series] = await Promise.all([
            wantMovies ? fetchOne<Movie>(def, 'movie', ctx) : Promise.resolve([] as Movie[]),
            wantSeries ? fetchOne<Serie>(def, 'tv', ctx) : Promise.resolve([] as Serie[]),
        ]);
        if (!movies.length && !series.length) return null;
        return { def, movies, series };
    } catch (err) {
        // Una fila que falla no puede tumbar la página: desaparece y las demás siguen.
        console.warn(`[catalogRows] ${def.key} falló:`, (err as Error).message);
        return null;
    }
}

/** Nombre corto para una etiqueta de tarjeta: «Amazon Prime Video» → «Prime Video», «Disney Plus» → «Disney+». */
function shortPlatformName(name: string): string {
    return name.replace(/^Amazon Prime Video\b/, 'Prime Video').replace(/ Plus$/, '+');
}

/** Plataformas que se miran como mucho para marcar una fila (cada una son 2 discover al día). */
const MAX_MARKED_PLATFORMS = 8;

/**
 * «Nuevo en streaming» con TUS plataformas (E2): cada título que está en una de ellas lleva
 * `_platform` con su nombre («Netflix») y esos van primero; el resto conserva su orden.
 *
 * Discover no dice en qué plataforma está cada resultado, así que por plataforma se pide la misma
 * fila filtrada a ella (`with_watch_providers` + suscripción). La filtrada sigue el mismo orden que la
 * general, así que todo título de las páginas 1..N de la general que esté en esa plataforma sale en
 * sus páginas 1..N. Cada filtrada pasa por la caché de `fetchOne` (por plataforma, región y día): la
 * comparten todos los que tienen esa plataforma. Si un título está en varias, gana la primera en el
 * orden en que el usuario las guardó.
 */
export async function markRowPlatforms(
    row: CatalogRowResult,
    platformIds: number[],
    region: string,
    pages = 1,
): Promise<CatalogRowResult> {
    const ids = platformIds.slice(0, MAX_MARKED_PLATFORMS);
    if (!ids.length) return row;
    const flatrate = { with_watch_monetization_types: 'flatrate' };
    const def: CatalogRowDef = {
        ...row.def,
        movieParams: { ...row.def.movieParams, ...flatrate },
        tvParams: { ...row.def.tvParams, ...flatrate },
    };
    const pageList = Array.from({ length: Math.max(1, Math.min(pages, 3)) }, (_, i) => String(i + 1));

    try {
        const [names, perPlatform] = await Promise.all([
            resolveProviderNames(ids, region),
            Promise.all(ids.map(async (id) => {
                const ctx: FetchContext = { filters: {}, providers: String(id), region, cacheable: true };
                const [movies, series] = await Promise.all([
                    row.movies.length ? Promise.all(pageList.map((page) => fetchOne<Movie>(def, 'movie', { ...ctx, page }))) : [],
                    row.series.length ? Promise.all(pageList.map((page) => fetchOne<Serie>(def, 'tv', { ...ctx, page }))) : [],
                ]);
                return { id, movies: new Set(movies.flat().map((m) => m.id)), series: new Set(series.flat().map((s) => s.id)) };
            })),
        ]);
        const label = (id: number) => shortPlatformName(names.get(id)?.base || names.get(id)?.name || '');
        const mark = <T extends { id: number }>(items: T[], pick: (p: typeof perPlatform[number]) => Set<number>) => {
            const out = items.map((it) => {
                const hit = perPlatform.find((p) => pick(p).has(it.id));
                return hit ? { ...it, _platform: label(hit.id) } : it;
            });
            // Orden estable: primero las tuyas, cada grupo como venía.
            return [...out.filter((it) => '_platform' in it), ...out.filter((it) => !('_platform' in it))];
        };
        return { ...row, movies: mark(row.movies, (p) => p.movies), series: mark(row.series, (p) => p.series) };
    } catch (err) {
        // Sin marcas la fila sigue sirviendo: se pinta tal cual.
        console.warn(`[catalogRows] marcas de ${row.def.key} fallaron:`, (err as Error).message);
        return row;
    }
}

export async function fetchCatalogRows(defs: CatalogRowDef[], ctx: FetchContext): Promise<CatalogRowResult[]> {
    const rows = await Promise.all(defs.map((d) => fetchCatalogRow(d, ctx)));
    return rows.filter((r): r is CatalogRowResult => r !== null);
}

export type { FetchContext as CatalogRowContext };
