import { tmdbFetch, posterUrl, backdropUrl } from "../tmdb/tmdbClient";
import { mapAndDeduplicateProviders } from "../tmdb/tmdbInfoService";
import { getCurrentLanguage, getCurrentRegion } from "../db/userScope";
import { processBatch } from "../../utils/core/processBatch";
import { getMovieCollectionInfo, type MovieCollectionInfo, type MovieCollectionPart } from "../movies/movieDetail";

/**
 * Todo lo de una saga para su página y el bloque de la ficha (2026-11-23, C3; handoff
 * `docs/Sagas/design_handoff_sagas/`). Sobre `getMovieCollectionInfo` (la saga y sus películas, con el
 * nombre limpio y los títulos provisionales) se pide cada película UNA vez con lo que la colección no
 * trae: duración, estado, fechas de estreno en tu país, dónde ver, reparto y taquilla. Y las imágenes de
 * la saga. Con eso salen el maratón, «te quedan», «dónde ver la saga» por plataforma y «quién repite».
 *
 * Caché en memoria de 1 h por saga, idioma y país (dato público de TMDB; sin datos del usuario: lo
 * tuyo, vistas y pendientes, se cruza en la página).
 */

export type SagaPartStatus = 'rumored' | 'planned' | 'production' | 'post' | 'canceled';

export interface SagaPart extends MovieCollectionPart {
    /** Estrenada (fecha mundial ya pasada). */
    released: boolean;
    runtime: number | null;
    /** Solo en las no estrenadas. */
    status: SagaPartStatus | null;
    /** Rumoreada · Anunciada · En producción · Posproducción · Cancelada. */
    statusLabel: string | null;
    /** Fechas en tu país: cines (tipos 2-3) y digital (tipo 4). */
    localRelease: { cinema: string | null; digital: string | null };
    revenue: number;
    vote_average: number;
}

export interface SagaPerson {
    id: number;
    name: string;
    profile: string | null;
    /** «Dirección» o el personaje. */
    role: string;
    /** En cuántas películas estrenadas sale. */
    count: number;
    director: boolean;
}

export type SagaProviderKind = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
export interface SagaProvider {
    id: number;
    name: string;
    logo: string | null;
    kind: SagaProviderKind;
    /** Qué películas tiene (ids, en el orden de la saga). */
    parts: number[];
}

export interface SagaDetail {
    info: MovieCollectionInfo;
    /** Por fecha de estreno; las que no tienen fecha, al final. */
    parts: SagaPart[];
    releasedCount: number;
    upcomingCount: number;
    /** Media de TMDB solo de las estrenadas con votos (0 si ninguna). */
    avgRating: number;
    /** Suma de duraciones de las estrenadas (min). */
    marathonMin: number;
    /** Suma de recaudaciones conocidas (US$). */
    revenue: number;
    firstYear: number | null;
    lastYear: number | null;
    /** Primera estreno y última estrenada (fechas mundiales). */
    firstDate: string | null;
    lastReleasedDate: string | null;
    /** Quien sale en 2 o más estrenadas: dirección primero, máx. 6. */
    repeats: SagaPerson[];
    /** Por plataforma: suscripción (incluye gratis y con anuncios) y alquiler/compra. */
    providers: { subscription: SagaProvider[]; rentBuy: SagaProvider[] };
    images: { posters: string[]; backdrops: string[] };
    region: string;
}

const STATUS: Record<string, { key: SagaPartStatus; label: string }> = {
    Rumored: { key: 'rumored', label: 'Rumoreada' },
    Planned: { key: 'planned', label: 'Anunciada' },
    'In Production': { key: 'production', label: 'En producción' },
    'Post Production': { key: 'post', label: 'Posproducción' },
    Canceled: { key: 'canceled', label: 'Cancelada' },
};

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { data: SagaDetail; expires: number }>();
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Fecha más temprana de unos tipos de estreno en el país (si no hay del país, null). */
function localDate(detail: any, region: string, types: number[]): string | null {
    const entry = (detail?.release_dates?.results ?? []).find((r: any) => r.iso_3166_1 === region);
    const dates = (entry?.release_dates ?? [])
        .filter((r: any) => types.includes(r.type) && r.release_date)
        .map((r: any) => String(r.release_date).slice(0, 10))
        .sort();
    return dates[0] ?? null;
}

/**
 * `infoPromise`: la ficha de película ya pide la saga (`getMovieCollectionInfo`) para no recomendarse
 * a sí misma; se le pasa esa misma promesa para no repetir la llamada (bloque de saga, C3.5).
 */
export async function getSagaDetail(
    collectionId: number,
    infoPromise?: Promise<MovieCollectionInfo | null>,
): Promise<SagaDetail | null> {
    const lang = getCurrentLanguage();
    const region = getCurrentRegion();
    const key = `${collectionId}:${lang}:${region}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;

    const info = await (infoPromise ?? getMovieCollectionInfo(collectionId));
    if (!info) return null;

    const sorted = [...info.parts].sort((a, b) => {
        if (!a.release_date) return 1;
        if (!b.release_date) return -1;
        return a.release_date.localeCompare(b.release_date);
    });

    const [details, images] = await Promise.all([
        processBatch(sorted.map((p) => p.id), (id: number) =>
            tmdbFetch<any>(`/movie/${id}`, { append_to_response: 'release_dates,watch/providers,credits' }).catch(() => null), 6),
        tmdbFetch<any>(`/collection/${collectionId}/images`, { include_image_language: `${lang.split('-')[0]},en,null`, language: '' })
            .catch(() => null),
    ]);

    const today = todayISO();
    const parts: SagaPart[] = sorted.map((p, i) => {
        const d = details[i];
        const released = !!p.release_date && p.release_date <= today;
        const st = !released && d?.status ? STATUS[d.status] ?? null : null;
        return {
            ...p,
            released,
            runtime: d?.runtime || null,
            status: st?.key ?? null,
            statusLabel: st?.label ?? (released ? null : 'Anunciada'),
            localRelease: { cinema: localDate(d, region, [3, 2]), digital: localDate(d, region, [4]) },
            revenue: d?.revenue > 0 ? d.revenue : 0,
            vote_average: p.vote_average || 0,
        };
    });

    const released = parts.filter((p) => p.released);
    const rated = released.filter((p) => (p.vote_count ?? 0) > 0);
    const years = parts.map((p) => (p.release_date ? Number(p.release_date.slice(0, 4)) : null)).filter((y): y is number => !!y);

    // Quién repite: cruzar los créditos de las estrenadas por persona.
    const people = new Map<number, SagaPerson & { order: number }>();
    released.forEach((p) => {
        const d = details[sorted.findIndex((s) => s.id === p.id)];
        const seenHere = new Set<number>();
        for (const c of (d?.credits?.crew ?? []).filter((c: any) => c.job === 'Director')) {
            if (seenHere.has(c.id)) continue;
            seenHere.add(c.id);
            const prev = people.get(c.id);
            if (prev) { prev.count++; prev.director = true; prev.role = 'Dirección'; }
            else people.set(c.id, { id: c.id, name: c.name, profile: posterUrl(c.profile_path, 'w185') || null, role: 'Dirección', count: 1, director: true, order: -1 });
        }
        for (const c of (d?.credits?.cast ?? []).slice(0, 20)) {
            if (seenHere.has(c.id)) continue;
            seenHere.add(c.id);
            const prev = people.get(c.id);
            if (prev) { prev.count++; prev.order = Math.min(prev.order, c.order ?? 99); }
            else people.set(c.id, { id: c.id, name: c.name, profile: posterUrl(c.profile_path, 'w185') || null, role: (c.character || '').replace(/\(voice\)/gi, '(voz)').trim(), count: 1, director: false, order: c.order ?? 99 });
        }
    });
    const repeats = [...people.values()]
        .filter((p) => p.count >= 2)
        .sort((a, b) => Number(b.director) - Number(a.director) || b.count - a.count || a.order - b.order)
        .slice(0, 6)
        .map(({ order: _order, ...p }) => p);

    // Dónde ver la saga: por plataforma, con qué películas tiene cada una (la forma más barata manda).
    // Las variantes de una misma plataforma («… with Ads», «… Amazon Channel») van juntas: para saber
    // dónde ver la saga basta «HBO Max · las tres».
    const rank = { flatrate: 5, free: 4, ads: 3, rent: 2, buy: 1 } as const;
    const baseName = (n: string) => n.trim()
        .replace(/\s+(standard\s+)?with\s+ads$/i, '')
        .replace(/\s+(amazon|apple tv)\s+channel$/i, '')
        .trim();
    const byProvider = new Map<string, SagaProvider>();
    parts.forEach((p, i) => {
        const local = details[i]?.['watch/providers']?.results?.[region];
        if (!local) return;
        for (const pr of mapAndDeduplicateProviders(local)) {
            const name = baseName(pr.provider_name);
            const kind = pr.type as SagaProviderKind;
            const isBase = name === pr.provider_name.trim();
            const prev = byProvider.get(name);
            if (prev) {
                if (!prev.parts.includes(p.id)) prev.parts.push(p.id);
                if (rank[kind] > rank[prev.kind]) prev.kind = kind;
                // El logo y el id de la plataforma principal, no los de su variante.
                if (isBase) { prev.id = pr.provider_id; prev.logo = posterUrl(pr.logo_path, 'w92') || prev.logo; }
            } else {
                byProvider.set(name, { id: pr.provider_id, name, logo: posterUrl(pr.logo_path, 'w92') || null, kind, parts: [p.id] });
            }
        }
    });
    for (const pr of byProvider.values()) pr.parts.sort((a, b) => parts.findIndex((x) => x.id === a) - parts.findIndex((x) => x.id === b));
    const providers = [...byProvider.values()].sort((a, b) => b.parts.length - a.parts.length || a.name.localeCompare(b.name));

    const data: SagaDetail = {
        info,
        parts,
        releasedCount: released.length,
        upcomingCount: parts.length - released.length,
        avgRating: rated.length ? rated.reduce((a, p) => a + p.vote_average, 0) / rated.length : 0,
        marathonMin: released.reduce((a, p) => a + (p.runtime ?? 0), 0),
        revenue: parts.reduce((a, p) => a + p.revenue, 0),
        firstYear: years.length ? Math.min(...years) : null,
        lastYear: years.length ? Math.max(...years) : null,
        firstDate: parts[0]?.release_date ?? null,
        lastReleasedDate: released.length ? released[released.length - 1].release_date ?? null : null,
        repeats,
        providers: {
            subscription: providers.filter((p) => p.kind === 'flatrate' || p.kind === 'free' || p.kind === 'ads'),
            rentBuy: providers.filter((p) => p.kind === 'rent' || p.kind === 'buy'),
        },
        images: {
            posters: (images?.posters ?? []).slice(0, 10).map((x: any) => posterUrl(x.file_path, 'w342')).filter(Boolean) as string[],
            backdrops: (images?.backdrops ?? []).slice(0, 8).map((x: any) => backdropUrl(x.file_path)).filter(Boolean) as string[],
        },
        region,
    };
    cache.set(key, { data, expires: Date.now() + TTL_MS });
    return data;
}
