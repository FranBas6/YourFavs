/**
 * «También en cine» / «También en televisión» — títulos del OTRO medio ligados a este.
 *
 * TMDB no modela esta relación: `/recommendations`, `/similar` y las colecciones son de un solo
 * medio, y `belongs_to_collection` ni siquiera existe en series. Así que se reconstruye cruzando
 * las dos únicas señales que la API sí deja medir (todo esto verificado contra TMDB en 2026-09):
 *
 *   1. TÍTULO — la raíz de la franquicia ("Attack on Titan: THE LAST ATTACK" → "Attack on Titan")
 *      buscada en el otro medio. Es lo que une la serie de AoT con sus 8 películas y El Señor de
 *      los Anillos con Los Anillos de Poder. Sola NO vale: "Friends" trae *Friends with Benefits*
 *      y *Just Friends*; "Dark" trae *El caballero oscuro*.
 *   2. KEYWORDS RARAS — el espacio de keywords es COMPARTIDO entre cine y TV, y el `total_results`
 *      de `/discover` dice en cuántos títulos se usa cada una, gratis: `tolkien` está en 5,
 *      `hobbit` en 8, `elves` en 133, `anime` en 6.844. Una keyword compartida y rara corrobora un
 *      título dudoso; las genéricas no significan nada.
 *
 * LÍMITE CONOCIDO: esto no une El Hobbit con El Señor de los Anillos. No comparten título y TMDB
 * no le pone la keyword `tolkien` a ninguna de las tres del Hobbit (ni a El retorno del Rey). Ese
 * caso necesita el grafo de Wikidata (P144 «basado en» / P179 «parte de la serie»), que queda
 * fuera de esta fase a propósito.
 */
import { tmdbFetch } from './tmdbClient';

export type MediaType = 'movie' | 'tv';

/** Cuántos candidatos de la búsqueda se llegan a evaluar (los demás ni se miran). */
const MAX_CANDIDATES = 12;
/** Cuántos se devuelven como mucho. */
const MAX_RESULTS = 8;
/**
 * Una keyword cuenta como «de franquicia» si se usa en pocos títulos (cine + TV sumados).
 * 150 deja fuera `anime` (6.844) o `based on manga` (3.290) y deja dentro `tolkien` (5) o
 * `elves` (133), que es lo que corrobora Anillos de Poder ↔ El Señor de los Anillos.
 */
const RARE_KEYWORD_MAX_USES = 150;
/**
 * Votos mínimos en TMDB para un título YA estrenado. No es un número redondo al azar: medido
 * sobre los casos frontera reales, hay un hueco de 2,5× a cada lado.
 *
 *   ruido    → "…Rings of Power Global Fan Screening" 57 · "Stranger Things: Fireplace" 83
 *   ────────────────────────────── 150 ──────────────────────────────
 *   buenos   → AoT Chronicle 206 · THE LAST ATTACK 254 · Downton El gran final 294 ·
 *              Wings of Freedom 388 · La guerra de los Rohirrim 930 · ESDLA del 78 1.085
 *
 * Es el filtro que sustituye a intentar adivinar por el título qué es un pase de fans o el vídeo
 * de la chimenea de Netflix: si una franquicia saca material de acompañamiento, la gente no lo
 * puntúa. Lo que se pierde a cambio son entradas legítimas muy oscuras, que es el precio del
 * listón alto que pediste.
 */
const MIN_VOTE_COUNT = 150;
/** Género 99 = Documental. Con el listón alto no entran ("The Manners of Downton Abbey"). */
const DOCUMENTARY_GENRE = 99;
/**
 * Una raíz con al menos estas dos cosas se considera distintiva por sí sola, sin corroborar.
 *
 * El que hace el trabajo de verdad es el de PALABRAS: los títulos que envenenan la búsqueda son
 * los de una sola ("Friends", "Dark", "You", "Lost"). El de caracteres es solo un suelo contra
 * raíces de dos palabras minúsculas, y está en 8 y no en 10 por un caso concreto: "star wars"
 * son 9 caracteres, y con 10 se caían The Clone Wars, The Bad Batch y Skeleton Crew.
 */
const DISTINCTIVE_MIN_WORDS = 2;
const DISTINCTIVE_MIN_CHARS = 8;
/** Lo mismo para escrituras sin espacios (ver `accept`): 進撃の巨人 = 6. */
const DISTINCTIVE_MIN_CJK_CHARS = 4;
/** Rango unicode de japonés/chino/coreano, para saber cuándo aplicar la medida de arriba. */
const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;
/**
 * Los corchetes con los que el japonés marca el nombre de la franquicia dentro del título:
 * 劇場版「進撃の巨人」完結編. Encontrar la raíz ahí dentro es tan concluyente como un prefijo.
 */
const CJK_BRACKETS = /[「」『』（）【】]/;

/** Cuánto se fía la caché de que una keyword no cambia de uso. Cambia lentísimo. */
const KEYWORD_USES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RelatedTitle {
    id: number;
    mediaType: MediaType;
    title: string;
    poster_path: string | null;
    year: string | null;
    /** Fecha ISO completa. No se pinta: es la que ordena la fila (ver el final de `compute…`). */
    releaseDate: string;
    voteAverage: number;
    /** Aún no estrenado: la ficha lo marca en vez de enseñar una nota que no existe. */
    upcoming: boolean;
    /** Por qué está en la lista. Va en el `title` de la tarjeta, no pintado. */
    reason: string;
}

/** Cómo encaja el título del candidato con la raíz de la franquicia. */
export type TitleMatch = 'exact' | 'prefix' | 'contains' | 'none';

/** Todo lo que se sabe de un candidato en el momento de decidir si entra. */
export interface CandidateSignals {
    titleMatch: TitleMatch;
    /** Palabras de la raíz que hizo match ("Attack on Titan" = 3). Una sola palabra = genérica. */
    rootWords: number;
    rootChars: number;
    /** La raíz está en una escritura sin espacios (japonés, chino, coreano). Ver `accept`. */
    rootIsCjk: boolean;
    /** Keywords compartidas con menos de RARE_KEYWORD_MAX_USES usos en TMDB. */
    rareShared: { name: string; uses: number }[];
    /** Keywords compartidas en total, genéricas incluidas. */
    sharedCount: number;
    voteCount: number;
    isDocumentary: boolean;
    /** Tiene fecha de estreno y está en el futuro. Aún no puede tener votos. */
    isUpcoming: boolean;
}

/**
 * LA REGLA. Aquí se decide qué se enseña, y es la línea que hay que mover si la sección sale
 * corta o sale sucia. Está calibrada en «pocas y seguras»: mejor no enseñar nada que enseñar
 * *El caballero oscuro* en la ficha de *Dark*.
 *
 * Se piden DOS cosas, y por separado:
 *
 *   1. QUE SEA DE LA FAMILIA. Dos vías:
 *      · El título se vale solo — raíz de ≥2 palabras y ≥10 caracteres que encaja como título
 *        exacto o como prefijo seguido de separador ("Attack on Titan: …").
 *      · El título es flojo (genérico, o la raíz aparece por el medio como en "El Camino: A
 *        Breaking Bad Movie") y entonces hace falta al menos UNA keyword rara que lo respalde.
 *        Esa es la vía por la que entra El Camino, con `methamphetamine`.
 *
 *   2. QUE SEA UNA OBRA, no material de acompañamiento. Aquí manda el recuento de votos, porque
 *      el título NO distingue un pase de fans de una película (ver MIN_VOTE_COUNT). La excepción
 *      son los estrenos futuros: no tienen votos porque nadie los ha visto, así que a esos se les
 *      exige título fuerte en su lugar. Un candidato sin fecha y sin votos se cae — eso es
 *      material suelto, no un estreno.
 */
export function accept(s: CandidateSignals): boolean {
    if (s.titleMatch === 'none') return false;
    if (s.isDocumentary) return false;

    // El japonés no separa con espacios: 進撃の巨人 son 6 caracteres de una pieza y ya es un
    // nombre único. Pedirle 2 palabras y 10 caracteres dejaría fuera a toda la animación
    // japonesa, así que a esas escrituras se las mide solo por longitud.
    const distinctiveRoot = s.rootIsCjk
        ? s.rootChars >= DISTINCTIVE_MIN_CJK_CHARS
        : s.rootWords >= DISTINCTIVE_MIN_WORDS && s.rootChars >= DISTINCTIVE_MIN_CHARS;

    const strongTitle = (s.titleMatch === 'exact' || s.titleMatch === 'prefix') && distinctiveRoot;

    if (!strongTitle && s.rareShared.length === 0) return false;

    return s.isUpcoming ? strongTitle : s.voteCount >= MIN_VOTE_COUNT;
}

/** Etiqueta del chip. Se decide con las mismas señales que la regla. */
function reasonFor(s: CandidateSignals): string {
    if (s.isUpcoming) return 'Próximo estreno';
    if (s.rareShared.length > 0) return s.rareShared[0].name;
    if (s.titleMatch === 'exact') return 'Mismo título';
    return 'Misma saga';
}

// ---------------------------------------------------------------------------
// Títulos
// ---------------------------------------------------------------------------

/** Minúsculas, sin acentos y sin puntuación doble: "El Señor de los Anillos" → "el senor de los anillos". */
function norm(s: string): string {
    return s
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[«»"'`´]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Raíz de la franquicia: lo que va antes del primer separador fuerte.
 * "Attack on Titan: THE LAST ATTACK" → "attack on titan"
 * "El señor de los anillos: la comunidad del anillo" → "el senor de los anillos"
 * Un título sin separador es su propia raíz ("Downton Abbey").
 */
export function franchiseRoot(title: string): string {
    const n = norm(title);
    const cut = n.split(/\s*[:–—]\s*|\s+-\s+|\s*\(/)[0];
    return cut.trim();
}

const DELIMITERS = [':', '–', '—', '-'];

/** Cómo encaja `root` dentro de `candidate`. Ver TitleMatch. */
export function matchTitle(root: string, candidate: string): TitleMatch {
    const c = norm(candidate);
    if (!root || !c) return 'none';
    if (c === root) return 'exact';
    if (c.startsWith(root)) {
        // Solo cuenta si lo siguiente es un separador de subtítulo. Si no, "Stranger Things Have
        // Happened to Me" se colaría en la ficha de Stranger Things.
        const rest = c.slice(root.length).trimStart();
        if (DELIMITERS.some(d => rest.startsWith(d))) return 'prefix';
        return 'none';
    }
    // La raíz por el medio, como palabra entera: "El Camino: A Breaking Bad Movie".
    // Los corchetes japoneses cuentan como frontera: el título original de las películas de AoT
    // es 劇場版「進撃の巨人」完結編…, y el japonés no separa con espacios, así que sin ellos la
    // serie no encontraría ninguna de sus propias películas.
    const idx = c.indexOf(root);
    if (idx > 0) {
        const before = c[idx - 1];
        const after = c[idx + root.length] ?? ' ';
        // Entre corchetes japoneses no es "aparece por ahí en medio": es el nombre de la saga
        // marcado como tal, así que vale tanto como un prefijo.
        if (CJK_BRACKETS.test(before) && CJK_BRACKETS.test(after)) return 'prefix';
        if (/[\s:–—-]/.test(before) && /[\s:–—-]/.test(after)) return 'contains';
    }
    return 'none';
}

// ---------------------------------------------------------------------------
// Keywords y su rareza
// ---------------------------------------------------------------------------

const keywordsCache = new Map<string, { data: { id: number; name: string }[]; expires: number }>();
const usesCache = new Map<number, { uses: number; expires: number }>();

/** Keywords de un título. TMDB las devuelve en `keywords` (cine) o `results` (TV). */
export async function fetchKeywords(type: MediaType, id: number): Promise<{ id: number; name: string }[]> {
    const key = `${type}:${id}`;
    const hit = keywordsCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;
    try {
        const r = await tmdbFetch<{ keywords?: any[]; results?: any[] }>(`/${type}/${id}/keywords`);
        const data = (r.keywords || r.results || []).map((k: any) => ({ id: k.id, name: k.name }));
        keywordsCache.set(key, { data, expires: Date.now() + KEYWORD_USES_TTL_MS });
        return data;
    } catch {
        return [];
    }
}

/**
 * En cuántos títulos de TMDB se usa una keyword (cine + TV). Es el medidor de rareza, y sale
 * gratis del `total_results` de /discover — no hace falta mantener ninguna lista a mano.
 */
async function keywordUses(id: number): Promise<number> {
    const hit = usesCache.get(id);
    if (hit && hit.expires > Date.now()) return hit.uses;
    try {
        const [m, t] = await Promise.all([
            tmdbFetch<{ total_results: number }>('/discover/movie', { with_keywords: String(id) }),
            tmdbFetch<{ total_results: number }>('/discover/tv', { with_keywords: String(id) }),
        ]);
        const uses = (m.total_results ?? 0) + (t.total_results ?? 0);
        usesCache.set(id, { uses, expires: Date.now() + KEYWORD_USES_TTL_MS });
        return uses;
    } catch {
        // Ante la duda, tratarla como genérica: que no corrobore nada de más.
        return Number.MAX_SAFE_INTEGER;
    }
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

interface SearchHit {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    poster_path: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_count: number;
    vote_average: number;
    popularity: number;
    genre_ids?: number[];
}

async function search(type: MediaType, query: string): Promise<SearchHit[]> {
    try {
        const r = await tmdbFetch<{ results: SearchHit[] }>(`/search/${type}`, { query, include_adult: 'false' });
        return r.results || [];
    } catch {
        return [];
    }
}

export interface CrossMediaInput {
    type: MediaType;
    id: number;
    /** Título en el idioma del usuario. */
    title: string;
    /** Título original: es lo que encuentra las películas japonesas de AoT. */
    originalTitle?: string | null;
    /** Si la ficha ya las pidió, se pasan y nos ahorramos la llamada. */
    keywords?: { id: number; name: string }[];
}

/** Traza de una decisión, para el script de verificación. No se usa en la página. */
export interface Decision {
    candidate: string;
    accepted: boolean;
    signals: CandidateSignals;
}

/**
 * Títulos del otro medio relacionados con este. Devuelve [] cuando no hay nada seguro, que es
 * el caso más común y es lo correcto: la sección simplemente no se pinta.
 */
export async function getCrossMediaRelated(
    input: CrossMediaInput,
    trace?: Decision[],
): Promise<RelatedTitle[]> {
    const key = `${input.type}:${input.id}`;
    const hit = resultCache.get(key);
    // Con `trace` se recalcula siempre: es el script de verificación y quiere ver las decisiones.
    if (hit && hit.expires > Date.now() && !trace) return hit.data;
    const data = await computeCrossMediaRelated(input, trace);
    // Se cachea TAMBIÉN el vacío, que es la respuesta más frecuente: la mayoría de fichas no
    // tienen nada al otro lado y sin esto pagarían la búsqueda en cada visita.
    resultCache.set(key, { data, expires: Date.now() + RESULT_TTL_MS });
    return data;
}

/**
 * Caché en memoria del proceso, como la de `yearStats`. No sobrevive a un despliegue ni se
 * comparte entre instancias de Netlify, y está bien: el coste de un fallo es una búsqueda.
 * Si esto se queda, el siguiente paso natural es el documento global tipo `hookRows`.
 */
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const resultCache = new Map<string, { data: RelatedTitle[]; expires: number }>();

async function computeCrossMediaRelated(
    input: CrossMediaInput,
    trace?: Decision[],
): Promise<RelatedTitle[]> {
    const other: MediaType = input.type === 'movie' ? 'tv' : 'movie';

    // Las dos raíces (localizada y original) suelen dar resultados distintos: "Ataque a los
    // Titanes" encuentra las traducidas y "進撃の巨人" las japonesas.
    const roots = Array.from(new Set(
        [input.title, input.originalTitle || ''].filter(Boolean).map(franchiseRoot).filter(r => r.length >= 3),
    ));
    if (roots.length === 0) return [];

    const hits = new Map<number, { hit: SearchHit; root: string; match: TitleMatch }>();
    for (const root of roots) {
        for (const hit of await search(other, root)) {
            const titles = [hit.title, hit.name, hit.original_title, hit.original_name].filter(Boolean) as string[];
            let best: TitleMatch = 'none';
            for (const t of titles) {
                const m = matchTitle(root, t);
                if (m === 'exact') { best = 'exact'; break; }
                if (m === 'prefix') best = 'prefix';
                if (m === 'contains' && best === 'none') best = 'contains';
            }
            if (best === 'none') continue;
            const prev = hits.get(hit.id);
            // Ante dos raíces que encajan, se queda la más específica (la más larga).
            if (!prev || root.length > prev.root.length) hits.set(hit.id, { hit, root, match: best });
        }
    }
    if (hits.size === 0) return [];

    const seedKeywords = input.keywords ?? await fetchKeywords(input.type, input.id);
    const seedIds = new Set(seedKeywords.map(k => k.id));

    const candidates = Array.from(hits.values())
        .sort((a, b) => (b.hit.popularity ?? 0) - (a.hit.popularity ?? 0))
        .slice(0, MAX_CANDIDATES);

    const out: RelatedTitle[] = [];
    for (const { hit, root, match } of candidates) {
        const isDocumentary = (hit.genre_ids ?? []).includes(DOCUMENTARY_GENRE);
        const rootWords = root.split(' ').filter(Boolean).length;
        const date = hit.release_date || hit.first_air_date || '';
        // Con fecha y en el futuro. Comparar las cadenas ISO basta y evita zonas horarias.
        const isUpcoming = date.length === 10 && date > new Date().toISOString().slice(0, 10);

        // Las keywords solo se piden cuando pueden cambiar la decisión: si el título ya es fuerte
        // y el candidato pasa los filtros baratos, no hace falta gastar la llamada.
        const preliminary: CandidateSignals = {
            titleMatch: match, rootWords, rootChars: root.length, rootIsCjk: CJK_RE.test(root),
            rareShared: [], sharedCount: 0,
            voteCount: hit.vote_count ?? 0, isDocumentary, isUpcoming,
        };
        // Solo puede salvarle una keyword rara si el resto de la regla ya lo dejaría pasar: si es
        // documental, o no tiene votos y no es un estreno, la llamada no cambiaría nada.
        const worthAsking = !isDocumentary && !isUpcoming && (hit.vote_count ?? 0) >= MIN_VOTE_COUNT;
        let signals = preliminary;
        if (!accept(preliminary) && worthAsking) {
            const theirs = await fetchKeywords(other, hit.id);
            const shared = theirs.filter(k => seedIds.has(k.id));
            const rare: { name: string; uses: number }[] = [];
            for (const k of shared) {
                const uses = await keywordUses(k.id);
                if (uses <= RARE_KEYWORD_MAX_USES) rare.push({ name: k.name, uses });
            }
            rare.sort((a, b) => a.uses - b.uses);
            signals = { ...preliminary, rareShared: rare, sharedCount: shared.length };
        }

        const ok = accept(signals);
        trace?.push({ candidate: hit.title || hit.name || String(hit.id), accepted: ok, signals });
        if (!ok) continue;

        out.push({
            id: hit.id,
            mediaType: other,
            title: hit.title || hit.name || '',
            poster_path: hit.poster_path,
            year: date ? date.slice(0, 4) : null,
            releaseDate: date,
            voteAverage: hit.vote_average ?? 0,
            upcoming: isUpcoming,
            reason: reasonFor(signals),
        });
        if (out.length >= MAX_RESULTS) break;
    }

    /**
     * La fila se lee como una cronología: de la más antigua a la más nueva, y los estrenos
     * futuros caen solos al final. Ojo a la división de trabajo — el recorte a MAX_RESULTS de
     * ahí arriba se hace por POPULARIDAD (si hay que dejar fuera a alguien, que sea a la más
     * irrelevante), y la fecha solo reordena a las que ya entraron. Si se ordenara por fecha
     * antes de recortar, una saga larga enseñaría sus seis entradas más viejas y escondería
     * la última película.
     */
    out.sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'));

    return out;
}
