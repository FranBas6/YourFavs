import { processBatch } from './processBatch';
import { tmdbFetch, tmdbFetchList } from '../services/API/shared/tmdbClient';
import { getTrending } from '../services/API/shared/tmdbDiscoverService';
import { calculateGenrePreferences, type Seed, type SeedWhy } from './genrePreferences';
import { getCached, setCached, invalidateCached } from './recsBlobCache';
import { getCurrentUid } from '../services/BD/shared/userScope';
import { appDateParts } from './appTime';
import { dedupeFranchises } from '../services/API/shared/catalogRows';

/**
 * Motor de «Para ti» (decisión de Fran, 2026-10-27: más señal y rotación; antes solo 6 favoritos
 * fijos y un discover por nota que devolvía el mismo canon a todo el mundo).
 *
 *   · Semillas: las de `genrePreferences` (favoritos, me gusta, onboarding, notas altas, vistas
 *     recientes), hasta SEED_LIMIT por tipo. Las primeras por peso y afinidad; las últimas
 *     (EXPLORE_SEEDS) reservadas a lo que MENOS se parece a tus géneros top, para que lo distinto
 *     que añades entre sí o sí (con EXPLORE_WEIGHT). Como mucho 2 semillas con el mismo perfil de
 *     géneros, y en el resultado como mucho MAX_PER_SEED_IN_RESULT títulos de la misma.
 *   · Candidatos: /recommendations de cada semilla (hasta MAX_ITEMS_PER_SEED) + un discover por tus
 *     géneros top ordenado por popularidad con filtros de calidad, con la página rotada por día.
 *   · Rotación: entre los candidatos de cada semilla y en el orden final, un desempate que cambia
 *     cada día (uid + fecha). Mismo día, mismo resultado; mañana, caras nuevas. La caché lleva el
 *     día en la clave.
 */
export interface SeedInfo {
    id: string;
    weight: number;
    title?: string;
    genres?: number[];
    why?: SeedWhy;
    /** Entró por la cuota de variedad (poca afinidad con tus géneros top). */
    explore?: boolean;
}

export interface PersonalRecResult {
    movies: any[];
    tv: any[];
    seedsMovies: SeedInfo[];
    seedsTv: SeedInfo[];
    libraryIds: { movies: Set<string>; tv: Set<string> };
    /** Semillas: `kept` elegidas, `diversified` de ellas por la cuota de variedad, `total` disponibles. */
    filterStats: {
        movies: { kept: number; diversified: number; total: number };
        tv: { kept: number; diversified: number; total: number };
    };
}

type SerializedRecs = Omit<PersonalRecResult, 'libraryIds'> & {
    libraryIds: { movies: string[]; tv: string[] };
};

const BLOB_KEY = 'personalRecs_v11';    // v11: variedad al 70 % y tope por semilla en el resultado; v10: más señales, cuota de variedad y rotación diaria; v9 _recSeedTitle
const L1_TTL_MS = 30 * 60 * 1000;       // 30min memoria
const L2_TTL_MS = 6 * 60 * 60 * 1000;   // 6h Netlify Blobs
const l1 = new Map<string, { data: PersonalRecResult; expires: number }>();

function deserializeRecs(s: SerializedRecs): PersonalRecResult {
    return {
        ...s,
        libraryIds: {
            movies: new Set(s.libraryIds.movies),
            tv: new Set(s.libraryIds.tv),
        },
    };
}

function serializeRecs(r: PersonalRecResult): SerializedRecs {
    return {
        ...r,
        libraryIds: {
            movies: Array.from(r.libraryIds.movies),
            tv: Array.from(r.libraryIds.tv),
        },
    };
}

const SEED_LIMIT = 10;
/** De las SEED_LIMIT, cuántas se reservan a lo menos parecido a tus géneros top. */
const EXPLORE_SEEDS = 2;
/**
 * Lo que generan las semillas de variedad entra con este peso: tiene que aparecer, no subirse al podio
 * (en prod, Sendokai y Los Simpson: la película ponían Los Proud y LA CQ en el top de series).
 */
const EXPLORE_WEIGHT = 0.7;
/**
 * Títulos de una misma semilla que caben en el resultado final; el resto baja al final de la lista.
 * Ataque a los Titanes colocaba 6 series seguidas (TMDB infla las notas del anime), como pasaba en
 * mayo con el anime deportivo. Es por semilla, no por género: a Memento le pasaría lo mismo.
 */
const MAX_PER_SEED_IN_RESULT = 3;
/** Semillas con el mismo perfil de géneros que caben a la vez. */
const MAX_SAME_PROFILE = 2;
const RESULT_LIMIT = 24;
// E: filtro vote_count mínimo para cortar nicho obscuro (pelis más exigente que series).
const MIN_VOTE_COUNT_MOVIE = 300;
const MIN_VOTE_COUNT_TV = 150;
// H: cap por seed → 1 seed nicho no puede monopolizar el pool con 10 recos cerradas.
const MAX_ITEMS_PER_SEED_MOVIE = 5;
const MAX_ITEMS_PER_SEED_TV = 5;
/** Entre cuántos de los mejores de cada semilla se rota a diario. */
const ROTATE_POOL = 10;
/** Cuánto mueve la rotación diaria el orden final (sobre un score híbrido de ~3–8). */
const DAILY_JITTER = 0.6;
/** Páginas del discover por las que se rota. */
const DISCOVER_PAGES = 3;

/** Hash estable [0, 1) de una cadena (FNV-1a), para la rotación diaria. */
function hash01(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 4294967296;
}

const AFFINITY_BOOST_SCALE = 2;

type Scored = { seed: Seed; score: number; affinity: number; genres: number[] };

/** Afinidad [0, 1] de una semilla con el mapa ponderado de géneros, y su puntuación para elegirla. */
function scoreSeeds(
    seeds: Seed[],
    genresById: Record<string, number[]>,
    weighted: Record<number, number>,
): Scored[] {
    let maxW = 0;
    for (const w of Object.values(weighted)) if (w > maxW) maxW = w;
    return seeds.map((seed) => {
        const genres = genresById[seed.id] || [];
        let sum = 0;
        for (const g of genres) sum += weighted[g] || 0;
        const affinity = maxW > 0 && genres.length ? (sum / genres.length) / maxW : 0;
        return { seed, score: seed.weight + affinity * AFFINITY_BOOST_SCALE, affinity, genres };
    });
}

const profileKey = (genres: number[]) => [...genres].sort((a, b) => a - b).join(',');

/**
 * Elige las semillas: las de más puntuación (peso + afinidad), con tope de MAX_SAME_PROFILE por
 * perfil de géneros, y las EXPLORE_SEEDS últimas para las de MENOS afinidad entre las que pesan
 * (lo distinto que has añadido). Si no hay bastantes, se rellena con lo que quede.
 */
function pickSeeds(scored: Scored[], limit: number): SeedInfo[] {
    const byScore = [...scored].sort((a, b) => b.score - a.score);
    const out: SeedInfo[] = [];
    const used = new Set<string>();
    const perProfile = new Map<string, number>();
    const take = (x: Scored, explore: boolean) => {
        used.add(x.seed.id);
        const k = profileKey(x.genres);
        perProfile.set(k, (perProfile.get(k) || 0) + 1);
        out.push({ id: x.seed.id, weight: x.seed.weight, title: x.seed.title, genres: x.genres, why: x.seed.why, ...(explore ? { explore: true } : {}) });
    };
    const core = Math.max(1, limit - EXPLORE_SEEDS);
    for (const x of byScore) {
        if (out.length >= core) break;
        if (!x.genres.length || (perProfile.get(profileKey(x.genres)) || 0) >= MAX_SAME_PROFILE) continue;
        take(x, false);
    }
    // Variedad: de lo que queda, lo menos afín primero (solo con géneros conocidos).
    const rest = byScore.filter((x) => !used.has(x.seed.id) && x.genres.length);
    const explore = [...rest].sort((a, b) => a.affinity - b.affinity || b.seed.weight - a.seed.weight);
    for (const x of explore) {
        if (out.length >= limit) break;
        if ((perProfile.get(profileKey(x.genres)) || 0) >= MAX_SAME_PROFILE) continue;
        take(x, true);
    }
    for (const x of byScore) {
        if (out.length >= limit) break;
        if (!used.has(x.seed.id)) take(x, false);
    }
    return out;
}

/** Cuando no hay semillas ni género (usuario sin favs ni onboarding): tendencias. */
async function trendingFallback(
    mediaType: 'movie' | 'tv',
    libIds: Set<string>,
    minVotes: number,
): Promise<any[]> {
    const list = await getTrending<any>(mediaType, 'week').catch(() => [] as any[]);
    return list
        .filter((m) => !libIds.has(String(m.id)) && (m.vote_count ?? 0) >= minVotes)
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, RESULT_LIMIT)
        .map((m) => ({ ...m, _recScore: 0, _recSources: 0, _fallback: true }));
}

export async function getPersonalRecommendations(): Promise<PersonalRecResult> {
    const uidKey = getCurrentUid() ?? 'guest';
    const now = Date.now();
    // El día en la clave: la rotación diaria no debe servirse desde la caché de ayer.
    const l1Key = `${uidKey}:${appDateParts(now).key}`;
    const blobKey = `${BLOB_KEY}:${l1Key}`;

    const hit = l1.get(l1Key);
    if (hit && hit.expires > now) return hit.data;

    // L2: si la Lambda es fría pero hay un cómputo reciente en Blobs, lo usamos.
    const cachedL2 = await getCached<SerializedRecs>(blobKey);
    if (cachedL2) {
        const data = deserializeRecs(cachedL2);
        l1.set(l1Key, { data, expires: now + L1_TTL_MS });
        return data;
    }

    const prefs = await calculateGenrePreferences();
    const day = appDateParts(now).key;
    const salt = `${uidKey}:${day}`;
    const jitter = (id: string | number) => hash01(`${salt}:${id}`);

    const movieScored = scoreSeeds(prefs.seeds.movies, prefs.genresById.movies, prefs.movies.weighted);
    const tvScored = scoreSeeds(prefs.seeds.tv, prefs.genresById.tv, prefs.tv.weighted);
    const movieSeeds = pickSeeds(movieScored, SEED_LIMIT);
    const tvSeeds = pickSeeds(tvScored, SEED_LIMIT);
    for (const x of movieSeeds) x.title ||= prefs.titlesById.movies[x.id];
    for (const x of tvSeeds) x.title ||= prefs.titlesById.tv[x.id];

    // seedId/seedWeight: la semilla MÁS fuerte que generó este candidato (4.4 · explicable).
    type Agg = { item: any; score: number; sources: number; seedId?: string; seedWeight?: number };
    const movieAgg = new Map<string, Agg>();
    const tvAgg = new Map<string, Agg>();

    const collect = (
        agg: Map<string, Agg>, seed: SeedInfo, results: any[], libIds: Set<string>, minVotes: number, perSeed: number,
    ) => {
        // Los ROTATE_POOL mejores por nota y, de ellos, perSeed distintos cada día.
        const eligible = results
            .filter((m: any) => !libIds.has(String(m.id)) && (m.vote_count ?? 0) >= minVotes)
            .sort((a: any, b: any) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
            .slice(0, ROTATE_POOL)
            .sort((a: any, b: any) => jitter(a.id) - jitter(b.id))
            .slice(0, perSeed);
        const w = seed.explore ? seed.weight * EXPLORE_WEIGHT : seed.weight;
        for (const m of eligible) {
            const k = String(m.id);
            const cur = agg.get(k);
            if (cur) {
                cur.score += w; cur.sources += 1;
                if (w > (cur.seedWeight ?? 0)) { cur.seedId = seed.id; cur.seedWeight = w; }
            } else {
                agg.set(k, { item: m, score: w, sources: 1, seedId: seed.id, seedWeight: w });
            }
        }
    };

    // Discover por géneros top: popularidad con filtros de calidad y página rotada por día. Corre
    // EN PARALELO con las recommendations de las semillas.
    const discoverPage = String(1 + Math.floor(hash01(`${salt}:discover`) * DISCOVER_PAGES));
    const movieGenresParam = prefs.movies.topGenres.join('|');
    const tvGenresParam = prefs.tv.topGenres.join('|');
    const discoverMoviePromise = movieGenresParam
        ? tmdbFetchList<any>('/discover/movie', {
            with_genres: movieGenresParam,
            sort_by: 'popularity.desc',
            'vote_count.gte': '500',
            'vote_average.gte': '6.8',
            include_adult: 'false',
            page: discoverPage,
        }).catch(() => [] as any[])
        : Promise.resolve([] as any[]);
    const discoverTvPromise = tvGenresParam
        ? tmdbFetchList<any>('/discover/tv', {
            with_genres: tvGenresParam,
            sort_by: 'popularity.desc',
            'vote_count.gte': '200',
            'vote_average.gte': '6.8',
            include_adult: 'false',
            page: discoverPage,
        }).catch(() => [] as any[])
        : Promise.resolve([] as any[]);

    const [, , discoverMoviesList, discoverTvList] = await Promise.all([
        processBatch(movieSeeds, async (seed: SeedInfo) => {
            try {
                const r = await tmdbFetch<any>(`/movie/${seed.id}/recommendations`);
                collect(movieAgg, seed, r?.results || [], prefs.libraryIds.movies, MIN_VOTE_COUNT_MOVIE, MAX_ITEMS_PER_SEED_MOVIE);
            } catch {}
        }, 8),
        processBatch(tvSeeds, async (seed: SeedInfo) => {
            try {
                const r = await tmdbFetch<any>(`/tv/${seed.id}/recommendations`);
                collect(tvAgg, seed, r?.results || [], prefs.libraryIds.tv, MIN_VOTE_COUNT_TV, MAX_ITEMS_PER_SEED_TV);
            } catch {}
        }, 8),
        discoverMoviePromise,
        discoverTvPromise,
    ]);

    // Booster conservador: candidatos solo-discover entran con score bajo; los que coinciden
    // con un seed reciben +0.5 (sources no se incrementa: solo seeds cuentan como fuente).
    const DISCOVER_BOOST = 0.5;
    for (const m of discoverMoviesList) {
        const k = String(m.id);
        if (prefs.libraryIds.movies.has(k)) continue;
        if ((m.vote_count ?? 0) < MIN_VOTE_COUNT_MOVIE) continue;
        const cur = movieAgg.get(k);
        if (cur) cur.score += DISCOVER_BOOST;
        else movieAgg.set(k, { item: m, score: DISCOVER_BOOST, sources: 0 });
    }
    for (const s of discoverTvList) {
        const k = String(s.id);
        if (prefs.libraryIds.tv.has(k)) continue;
        if ((s.vote_count ?? 0) < MIN_VOTE_COUNT_TV) continue;
        const cur = tvAgg.get(k);
        if (cur) cur.score += DISCOVER_BOOST;
        else tvAgg.set(k, { item: s, score: DISCOVER_BOOST, sources: 0 });
    }

    // «Porque te gustó X»: el título de la semilla viene resuelto con sus géneros (0 peticiones).
    const movieSeedTitles = new Map(Object.entries(prefs.titlesById.movies));
    const tvSeedTitles = new Map(Object.entries(prefs.titlesById.tv));

    // I: score híbrido. sources×1.5 + score×0.5 + (rating/10)×2, más el desempate del día.
    const hybridScore = (a: Agg) =>
        a.sources * 1.5 + a.score * 0.5 + ((a.item.vote_average ?? 0) / 10) * 2 + jitter(a.item.id) * DAILY_JITTER;
    /** Tope por semilla: los que sobran de una misma semilla pasan al final, en su orden. */
    const capPerSeed = (list: Agg[]) => {
        const seen = new Map<string, number>();
        const head: Agg[] = [];
        const tail: Agg[] = [];
        for (const a of list) {
            const n = a.seedId ? (seen.get(a.seedId) || 0) : 0;
            if (a.seedId) seen.set(a.seedId, n + 1);
            (n < MAX_PER_SEED_IN_RESULT ? head : tail).push(a);
        }
        return [...head, ...tail];
    };
    const sortAgg = (m: Map<string, Agg>, titles: Map<string, string>) => dedupeFranchises(capPerSeed(Array.from(m.values())
        .sort((a, b) =>
            hybridScore(b) - hybridScore(a) ||
            b.sources - a.sources ||
            (b.item.vote_average ?? 0) - (a.item.vote_average ?? 0)
        ))
        .map(r => ({
            ...r.item,
            _recScore: r.score,
            _recSources: r.sources,
            _recSeedTitle: r.seedId ? titles.get(r.seedId) : undefined,
        })))
        .slice(0, RESULT_LIMIT);

    let movies = sortAgg(movieAgg, movieSeedTitles);
    let tv = sortAgg(tvAgg, tvSeedTitles);

    // Fallback: sin semillas ni género (usuario nuevo sin favs ni onboarding) el pool queda
    // vacío → mostramos tendencias en vez de un hueco. También cubre cobertura parcial.
    if (movies.length === 0) movies = await trendingFallback('movie', prefs.libraryIds.movies, MIN_VOTE_COUNT_MOVIE);
    if (tv.length === 0) tv = await trendingFallback('tv', prefs.libraryIds.tv, MIN_VOTE_COUNT_TV);

    const data: PersonalRecResult = {
        movies,
        tv,
        seedsMovies: movieSeeds,
        seedsTv: tvSeeds,
        libraryIds: prefs.libraryIds,
        filterStats: {
            movies: { kept: movieSeeds.length, diversified: movieSeeds.filter((x) => x.explore).length, total: prefs.seeds.movies.length },
            tv: { kept: tvSeeds.length, diversified: tvSeeds.filter((x) => x.explore).length, total: prefs.seeds.tv.length },
        },
    };

    l1.set(l1Key, { data, expires: now + L1_TTL_MS });
    setCached(blobKey, serializeRecs(data), L2_TTL_MS).catch(() => {});
    return data;
}

export function invalidatePersonalRecsCache() {
    const uidKey = getCurrentUid() ?? 'guest';
    const key = `${uidKey}:${appDateParts(Date.now()).key}`;
    l1.delete(key);
    invalidateCached(`${BLOB_KEY}:${key}`).catch(() => {});
}
