// Scraper de eldoblaje.com — base de datos del doblaje en España.
//
// eldoblaje.com NO tiene API. Es un IIS clásico que sirve HTML en ISO-8859-1.
// Estructura verificada:
//   - Búsqueda:  GET /datos/KeywordResults.asp?keyword=X  (sin año en resultados)
//   - Ficha:     GET /datos/FichaPelicula.asp?id=N
//                tabla con filas <tr>: 3 <td>
//                  [1] <a FichaActorOriginal.asp?id=>APELLIDO, NOMBRE</a>
//                  [2] <a FichaActorDoblaje.asp?id=>APELLIDO, NOMBRE</a>
//                  [3] Personaje (texto plano)
//
// Todo el scraping es bajo demanda (clic del usuario en el desplegable) y se
// cachea agresivamente en Blobs (TTL 180d), así que NUNCA toca el SSR de la
// página de detalle. Si algo falla → degradación elegante a linkout.

const BASE = 'https://www.eldoblaje.com/datos';
// IIS 6.0 viejo: el handshake TLS en frío es lento (2-4s). 8s da margen.
// Aun si aborta, el endpoint degrada a linkout — nunca rompe la página.
const FETCH_TIMEOUT_MS = 8000;

export interface EldoblajeResult {
    id: number;
    title: string; // tal cual aparece en eldoblaje (MAYÚSCULAS)
}

export interface DubbingEntry {
    originalActor: string;   // "RADCLIFFE, DANIEL"
    originalId: number | null;
    dubActor: string;        // "AMIGO, AXEL"
    dubId: number | null;
    character: string;       // "Harry Potter"
}

// ── Helpers de decodificación ──────────────────────────────────────────────

/** Fetch que decodifica el cuerpo como ISO-8859-1 (eldoblaje usa latin1). */
async function fetchLatin1(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                // UA de navegador real: IIS clásico a veces responde raro a clientes sin UA.
                'User-Agent': 'Mozilla/5.0 (compatible; YourFavs/1.0; +https://yourfavs.app)',
                'Accept-Language': 'es-ES,es;q=0.9',
            },
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[eldoblaje] ${res.status} en ${url}`);
            return null;
        }
        const buf = await res.arrayBuffer();
        return new TextDecoder('iso-8859-1').decode(buf);
    } catch (err) {
        console.warn(`[eldoblaje] fetch falló ${url}:`, (err as Error).message);
        return null;
    }
}

const ENTITIES: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'",
    '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
    '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
    '&ntilde;': 'ñ', '&Ntilde;': 'Ñ', '&uuml;': 'ü', '&Uuml;': 'Ü',
};

/** Decodifica entidades HTML comunes + numéricas, colapsa espacios. */
function decodeEntities(s: string): string {
    let out = s.replace(/&[A-Za-z]+;/g, (m) => ENTITIES[m] ?? m);
    out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    return out.replace(/\s+/g, ' ').trim();
}

/** Quita etiquetas HTML y decodifica entidades de un fragmento. */
function stripTags(html: string): string {
    return decodeEntities(html.replace(/<[^>]+>/g, ''));
}

/**
 * Normaliza un título para comparar: MAYÚSCULAS, sin acentos, sin signos de
 * puntuación, espacios colapsados. "Harry Potter y la piedra filosofal"
 * → "HARRY POTTER Y LA PIEDRA FILOSOFAL".
 */
export function normalizeTitle(s: string): string {
    return s
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita diacríticos
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')                      // signos → espacio
        .replace(/\s+/g, ' ')
        .trim();
}

/** Conjunto de tokens (palabras) de un título normalizado. */
export function tokenSet(s: string): Set<string> {
    return new Set(normalizeTitle(s).split(' ').filter(Boolean));
}

/**
 * Convierte el nombre de eldoblaje ("APELLIDOS, NOMBRE") al orden buscable en
 * TMDB ("NOMBRE APELLIDOS"). "FERNÁNDEZ MEJÍAS, JUAN" → "JUAN FERNÁNDEZ MEJÍAS".
 */
export function dubNameToQuery(name: string): string {
    const i = name.indexOf(',');
    if (i === -1) return name.trim();
    const last = name.slice(0, i).trim();
    const first = name.slice(i + 1).trim();
    return `${first} ${last}`.replace(/\s+/g, ' ').trim();
}

// ── Scraping ────────────────────────────────────────────────────────────────

/** Busca un título y devuelve las fichas de PELÍCULA candidatas. */
export async function searchEldoblaje(title: string): Promise<EldoblajeResult[]> {
    const url = `${BASE}/KeywordResults.asp?keyword=${encodeURIComponent(title)}`;
    const html = await fetchLatin1(url);
    if (!html) return [];

    const results: EldoblajeResult[] = [];
    const seen = new Set<number>();
    // Cada candidato es un <a href="FichaPelicula.asp?id=N">TÍTULO</a>
    const re = /FichaPelicula\.asp\?id=(\d+)[^>]*>([^<]+)</gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const id = parseInt(m[1], 10);
        if (seen.has(id)) continue;
        const t = decodeEntities(m[2]);
        if (!t) continue;
        seen.add(id);
        results.push({ id, title: t });
    }
    return results;
}

/**
 * Elige la mejor ficha entre los candidatos de búsqueda.
 *
 * ⚠️ DECISIÓN DE NEGOCIO — la implementas tú (ver bloque de petición).
 * NO hay año en los resultados de búsqueda → desambiguar SOLO por título.
 *
 * @param tmdbTitle  título es-ES de TMDB
 * @param candidates resultados de searchEldoblaje
 * @returns id de la ficha elegida, o null si ninguna supera tu umbral de confianza
 */
// Umbral de confianza. ── ÚNICA PERILLA A AJUSTAR ──
// 0.62 es deliberadamente algo laxo: eldoblaje añade a veces sufijos
// ("(PARTE 1)", subtítulos, "V.O.") que meten tokens extra y bajan el Jaccard
// de un match correcto. Más estricto (0.8+) → más fiable pero más linkouts.
const MATCH_THRESHOLD = 0.62;

export function pickBestMatch(tmdbTitle: string, candidates: EldoblajeResult[]): number | null {
    if (!candidates.length) return null;

    const target = normalizeTitle(tmdbTitle);
    const targetTokens = tokenSet(tmdbTitle);
    if (!targetTokens.size) return null;

    let bestId: number | null = null;
    let bestScore = 0;

    for (const c of candidates) {
        const candNorm = normalizeTitle(c.title);
        // Igualdad exacta normalizada → confianza máxima, cortamos ya.
        if (candNorm === target) return c.id;

        const candTokens = tokenSet(c.title);
        if (!candTokens.size) continue;

        // Jaccard: |A ∩ B| / |A ∪ B|.
        let inter = 0;
        for (const t of targetTokens) if (candTokens.has(t)) inter++;
        const union = targetTokens.size + candTokens.size - inter;
        const score = union ? inter / union : 0;

        if (score > bestScore) {
            bestScore = score;
            bestId = c.id;
        }
    }

    return bestScore >= MATCH_THRESHOLD ? bestId : null;
}

export interface SeasonFicha {
    season: number;
    fichaId: number;
}

// "[1ª temporada]", "[2ª Temporada]", "[1a temp.]"…
const SEASON_RE = /\[\s*(\d+)\s*[ºªa.]*\s*temp/i;
const YEAR_RE = /\((\d{4})\)/; // "(2007)" → desambigua reboots con el mismo título

/**
 * De los candidatos de búsqueda de una SERIE, devuelve las fichas por temporada
 * cuyo título base casa con el de TMDB. Ignora "[Nª temporada]" y "(año)" para
 * comparar, y usa el año (si lo da TMDB) para desambiguar reboots — p.ej.
 * "GOSSIP GIRL (2007)" vs "GOSSIP GIRL (2021)". Ordenadas por temporada asc.
 */
export function resolveSeriesFichas(
    tmdbTitle: string,
    candidates: EldoblajeResult[],
    tmdbYear?: number | null,
): SeasonFicha[] {
    const target = normalizeTitle(tmdbTitle);
    const targetTokens = tokenSet(tmdbTitle);
    const matched: Array<{ season: number; fichaId: number; yearMatch: boolean }> = [];

    for (const c of candidates) {
        const sm = SEASON_RE.exec(c.title);
        if (!sm) continue;
        const season = parseInt(sm[1], 10);
        if (!season) continue;

        const ym = YEAR_RE.exec(c.title);
        const year = ym ? parseInt(ym[1], 10) : null;

        // base: quita "[…temporada]" Y "(año)"
        const base = c.title.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
        const baseNorm = normalizeTitle(base);
        let ok = baseNorm === target;
        if (!ok) {
            const bt = tokenSet(base);
            let inter = 0;
            for (const t of targetTokens) if (bt.has(t)) inter++;
            const union = targetTokens.size + bt.size - inter;
            ok = union > 0 && inter / union >= 0.8; // base más estricto (ya sin ruido)
        }
        if (!ok) continue;

        const yearMatch = year != null && tmdbYear != null && Math.abs(year - tmdbYear) <= 1;
        matched.push({ season, fichaId: c.id, yearMatch });
    }

    // Si alguna ficha casa por año, nos quedamos SOLO con esas (desambigua reboots).
    const hasYearMatch = matched.some((m) => m.yearMatch);
    const filtered = hasYearMatch ? matched.filter((m) => m.yearMatch) : matched;

    const bySeason = new Map<number, number>();
    for (const m of filtered) if (!bySeason.has(m.season)) bySeason.set(m.season, m.fichaId);
    return [...bySeason.entries()]
        .map(([season, fichaId]) => ({ season, fichaId }))
        .sort((a, b) => a.season - b.season);
}

/** Parsea una ficha de película y devuelve las parejas actor→doblador. */
export async function parseFicha(fichaId: number): Promise<DubbingEntry[]> {
    const url = `${BASE}/FichaPelicula.asp?id=${fichaId}`;
    const html = await fetchLatin1(url);
    if (!html) return [];

    const entries: DubbingEntry[] = [];
    // Troceamos por filas y nos quedamos con las que tienen AMBOS links.
    const rows = html.split(/<tr[\s>]/i);
    for (const row of rows) {
        const orig = /FichaActorOriginal\.asp\?id=(\d+)[^>]*>([^<]+)</i.exec(row);
        const dub = /FichaActorDoblaje\.asp\?id=(\d+)[^>]*>([^<]+)</i.exec(row);
        if (!orig || !dub) continue;

        // El personaje es el 3er <td> — el último de la fila sin link.
        const tds = row.split(/<td[^>]*>/i).slice(1).map((c) => stripTags(c.split('</td>')[0] || ''));
        const character = tds.length >= 3 ? tds[2] : '';

        entries.push({
            originalActor: decodeEntities(orig[2]),
            originalId: parseInt(orig[1], 10),
            dubActor: decodeEntities(dub[2]),
            dubId: parseInt(dub[1], 10),
            character,
        });
    }
    return entries;
}

export interface DubberWork {
    originalActor: string;
    title: string;                 // "TRACKER [2ª temporada]" tal cual aparece
    baseTitle: string;             // sin "[…]" ni "(año)" → para resolver en TMDB
    season: number | null;         // de "[Nª temporada]" → pista de que es serie
    fichaPeliculaId: number | null;
    character: string;
    year: number | null;
    isVideogame: boolean;          // "[videojuego]" → YourFavs no tiene info, se descarta
}

/** Clave de nombre invariante al orden, para comparar nombres de persona. */
function nameKey(name: string): string {
    return normalizeTitle(name).split(' ').filter(Boolean).sort().join(' ');
}

/**
 * Busca un doblador por nombre y devuelve el id de su FichaActorDoblaje.
 * Match ESTRICTO (clave de nombre exacta) para no confundir homónimos: la
 * mayoría de actores de TMDB no son dobladores → devolver null es lo correcto.
 */
export async function searchDubberFichaId(name: string): Promise<number | null> {
    const html = await fetchLatin1(`${BASE}/KeywordResults.asp?keyword=${encodeURIComponent(name)}`);
    if (!html) return null;
    const target = nameKey(name);
    const re = /FichaActorDoblaje\.asp\?id=(\d+)[^>]*>([^<]+)</gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        if (nameKey(decodeEntities(m[2])) === target) return parseInt(m[1], 10);
    }
    return null;
}

/** Parsea las filas de doblaje de UNA página de ficha de doblador. */
function parseWorksFromHtml(html: string): DubberWork[] {
    const works: DubberWork[] = [];
    const rows = html.split(/<tr[\s>]/i);
    for (const row of rows) {
        const film = /FichaPelicula\.asp\?id=(\d+)[^>]*>([^<]+)</i.exec(row);
        if (!film) continue; // filas sin título (cabecera, etc.) fuera
        const orig = /FichaActorOriginal\.asp\?id=(\d+)[^>]*>([^<]+)</i.exec(row);
        const tds = row.split(/<td[^>]*>/i).slice(1).map((c) => stripTags(c.split('</td>')[0] || ''));

        const title = decodeEntities(film[2]);
        const sm = SEASON_RE.exec(title);
        const yearCell = tds.length >= 4 ? tds[3] : '';
        const year = parseInt((yearCell.match(/\d{4}/) || [])[0] || '', 10) || null;

        works.push({
            originalActor: orig ? decodeEntities(orig[2]) : '',
            title,
            baseTitle: title.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(),
            season: sm ? parseInt(sm[1], 10) : null,
            fichaPeliculaId: parseInt(film[1], 10),
            character: tds.length >= 3 ? tds[2] : '',
            year,
            isVideogame: /\[\s*videojuego\s*\]/i.test(title),
        });
    }
    return works;
}

/**
 * Filmografía COMPLETA de un doblador. La ficha pagina a ~50 por página
 * (`&pag=N`); detectamos el nº de páginas en la primera y traemos el resto
 * en paralelo (cada fetch es lento, pero independiente).
 */
export async function fetchDubberFilmography(dubberId: number): Promise<DubberWork[]> {
    const first = await fetchLatin1(`${BASE}/FichaActorDoblaje.asp?id=${dubberId}`);
    if (!first) return [];

    let maxPag = 1;
    for (const m of first.matchAll(/[?&]pag=(\d+)/gi)) maxPag = Math.max(maxPag, parseInt(m[1], 10));

    const works = parseWorksFromHtml(first);
    if (maxPag > 1) {
        const rest = await Promise.all(
            Array.from({ length: maxPag - 1 }, (_, i) =>
                fetchLatin1(`${BASE}/FichaActorDoblaje.asp?id=${dubberId}&pag=${i + 2}&orden=`)
                    .then((h) => (h ? parseWorksFromHtml(h) : []))
                    .catch(() => [] as DubberWork[]),
            ),
        );
        for (const w of rest) works.push(...w);
    }
    return works;
}

export const ELDOBLAJE_BASE = BASE;
