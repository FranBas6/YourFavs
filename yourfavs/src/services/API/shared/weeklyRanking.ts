/**
 * «Lo más popular esta semana en {región}» — el Top 10 con su movimiento respecto a la semana anterior.
 *
 * **El título es una decisión, no una etiqueta.** TMDB da popularidad GLOBAL; `watch_region` filtra por
 * dónde se puede ver, no por qué se ve allí. Llamar a esto «las 10 más vistas hoy en España» sería
 * afirmar algo que los datos no sostienen y que cualquiera desmiente comparándolo con Netflix. Lo que sí
 * es cierto —y lo que dicen el título y el subtítulo— es «lo más popular esta semana entre lo disponible
 * en tus plataformas».
 *
 * **El movimiento (▲4 / NUEVA) no lo da TMDB**: hace falta guardar el ranking de la semana pasada. Por eso
 * hay un documento por (región + conjunto de plataformas), con la semana actual y la anterior DENTRO del
 * mismo documento: así el movimiento sale de UNA lectura y el documento no crece sin límite.
 *
 * Coste: `2 × nº de plataformas` llamadas a discover **una vez por semana** (8 con cuatro plataformas).
 * Se consulta plataforma a plataforma en vez de unirlas con `|` a propósito: cuesta lo mismo por semana y
 * de propina se sabe **en qué plataforma** está cada título, que es lo que necesitan el aviso de
 * «no todas están en tus plataformas» y los tratamientos de ranking con etiqueta de plataforma.
 */
import { claimAppState, readAppState, releaseAppState, writeAppState } from './appState';
import { tmdbFetch } from './tmdbClient';
import { isoWeekKey } from '../../../utils/appTime';
import {
    normalizeRankingPlatforms, rankingDocId, withMovement,
    type RankedEntry, type RankingItem,
} from '../../../utils/rankingCore';

export { rankingDocId, withMovement };
export type { RankedEntry, RankingItem };

/** Cuántos puestos tiene la fila. */
export const RANKING_SIZE = 10;
/** Ventana del claim, para que dos arranques en frío no calculen la misma semana. */
const CLAIM_TTL_MS = 5 * 60 * 1000;

export interface RankingDoc {
    week: string;
    items: RankingItem[];
    /**
     * `null`, no `undefined`, en la primera semana: el JSON que se guarda en `app_state` no conserva
     * `undefined` (en Firestore, además, lo rechazaba y dio un 500 al vaciar el nombre del perfil).
     */
    prevWeek?: string | null;
    prevItems?: RankingItem[];
    updatedAt: number;
    claimedAt?: number;
}

interface TmdbHit {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    popularity?: number;
}

async function discoverPopular(mediaType: 'movie' | 'tv', region: string, provider?: number): Promise<TmdbHit[]> {
    const params: Record<string, string> = {
        sort_by: 'popularity.desc',
        'vote_count.gte': '50',
        watch_region: region,
    };
    if (provider) params.with_watch_providers = String(provider);
    try {
        const data = await tmdbFetch<{ results?: TmdbHit[] }>(`/discover/${mediaType}`, params);
        return data.results || [];
    } catch {
        return [];
    }
}

/** Calcula el Top de la semana. Mezcla cine y TV por popularidad, que es la única escala común. */
export async function computeRanking(region: string, platforms: number[]): Promise<RankingItem[]> {
    const ids = normalizeRankingPlatforms(platforms);
    const queries: Promise<{ hits: TmdbHit[]; mediaType: 'movie' | 'tv'; provider?: number }>[] = [];

    for (const mediaType of ['movie', 'tv'] as const) {
        if (ids.length) {
            for (const p of ids) {
                queries.push(discoverPopular(mediaType, region, p).then((hits) => ({ hits, mediaType, provider: p })));
            }
        } else {
            // Sin plataformas configuradas la fila sigue funcionando: solo región.
            queries.push(discoverPopular(mediaType, region).then((hits) => ({ hits, mediaType })));
        }
    }

    const merged = new Map<string, RankingItem>();
    for (const { hits, mediaType, provider } of await Promise.all(queries)) {
        for (const h of hits) {
            const key = `${mediaType}:${h.id}`;
            const existing = merged.get(key);
            if (existing) {
                existing.popularity = Math.max(existing.popularity, h.popularity || 0);
                if (provider && !existing.providers.includes(provider)) existing.providers.push(provider);
                continue;
            }
            merged.set(key, {
                id: h.id,
                mediaType,
                title: h.title || h.name || '',
                posterPath: h.poster_path ?? null,
                backdropPath: h.backdrop_path ?? null,
                year: (h.release_date || h.first_air_date || '').slice(0, 4),
                popularity: h.popularity || 0,
                providers: provider ? [provider] : [],
            });
        }
    }

    return [...merged.values()]
        .filter((it) => it.title && it.posterPath)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, RANKING_SIZE);
}


/**
 * La fila lista para pintar. Si la semana guardada no es la actual, recalcula (con claim) y rota la
 * semana anterior; si ya está al día, es UNA lectura.
 *
 * Devuelve `null` si no hay nada que pintar: la fila no se dibuja, ni vacía ni con esqueleto.
 */
export async function getWeeklyRanking(region: string, platforms: number[]): Promise<{ entries: RankedEntry[]; week: string } | null> {
    const key = rankingDocId(region, platforms); // app_state (antes homeRows/{id})
    const week = isoWeekKey(Date.now());

    let doc: RankingDoc | null = null;
    try {
        doc = await readAppState<RankingDoc>(key);
    } catch (err) {
        console.warn('[weeklyRanking] lectura falló:', (err as Error).message);
        return null;
    }

    if (doc?.week === week && doc.items?.length) {
        return { entries: withMovement(doc.items, doc.prevItems), week };
    }

    // Toca semana nueva. El claim evita que dos instancias gasten las mismas llamadas a TMDB.
    let claimed = false;
    try {
        const cur = await claimAppState<RankingDoc>(key, CLAIM_TTL_MS);
        if (cur !== false) {
            // Entre la lectura y el claim otra instancia pudo terminar la semana: se suelta y se sirve.
            if (cur?.week === week && cur.items?.length) {
                await releaseAppState(key);
                return { entries: withMovement(cur.items, cur.prevItems), week };
            }
            claimed = true;
        }
    } catch (err) {
        console.warn('[weeklyRanking] claim falló:', (err as Error).message);
    }

    if (!claimed) {
        // Otra instancia lo está calculando: se sirve lo de la semana pasada antes que nada.
        return doc?.items?.length ? { entries: withMovement(doc.items, doc.prevItems), week: doc.week } : null;
    }

    try {
        const items = await computeRanking(region, platforms);
        if (!items.length) {
            await releaseAppState(key).catch(() => {});
            return doc?.items?.length ? { entries: withMovement(doc.items, doc.prevItems), week: doc.week } : null;
        }
        // La semana que había pasa a ser "la anterior": es la referencia del movimiento.
        const next: RankingDoc = {
            week,
            items,
            prevWeek: doc?.week ?? null,
            prevItems: doc?.items || [],
            updatedAt: Date.now(),
        };
        await writeAppState(key, next);
        console.log(`[weeklyRanking] ${rankingDocId(region, platforms)} → ${week}, ${items.length} títulos`);
        return { entries: withMovement(items, next.prevItems), week };
    } catch (err) {
        console.warn('[weeklyRanking] cálculo falló:', (err as Error).message);
        await releaseAppState(key).catch(() => {});
        return doc?.items?.length ? { entries: withMovement(doc.items, doc.prevItems), week: doc.week } : null;
    }
}
