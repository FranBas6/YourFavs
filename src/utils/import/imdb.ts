/**
 * Exportaciones de IMDb (TMDB D3a). IMDb da un CSV por página: «Tus valoraciones» (`ratings.csv`)
 * y «Tu watchlist» (`WATCHLIST.csv`); las listas propias salen con el mismo formato que la watchlist
 * y se importan como colecciones (lote F1). El CSV no trae el nombre de la lista: sale del fichero.
 *
 *   ratings:   Const, Your Rating, Date Rated, Title, … Title Type, … Year, …
 *   watchlist: Position, Const, Created, Modified, Description, Title, … Title Type, … Year, …
 *
 * `Const` es el id de IMDb (`tt0137523`), que TMDB traduce exacto con `/find`: aquí no hay que
 * adivinar por título como con Letterboxd.
 */
import { parseCsv } from './csv';

export type ImdbFileKind = 'ratings' | 'watchlist' | 'list' | 'unknown';

export interface ImdbRow {
    imdb: string;
    title: string;
    year: number | null;
    /** Pista para elegir entre película y serie si `/find` diera las dos. */
    type: 'movie' | 'tv';
    /** Solo en ratings: tu nota de IMDb (1-10). */
    rating?: number;
    /** YYYY-MM-DD: cuándo la valoraste o la añadiste a la watchlist. */
    date?: string;
    /** A dónde va: valorada → Vistas (+ nota); watchlist → Pendientes; `list` → solo a su colección. */
    kind: 'seen' | 'watchlist' | 'list';
}

export interface ImdbFile {
    kind: ImdbFileKind;
    rows: ImdbRow[];
    /** Filas que no son películas ni series (episodios sueltos, videojuegos, podcasts…). */
    ignored: number;
    /** Filas sin un `tt…` válido. */
    invalid: number;
    /** Lista propia (F1): su nombre y sus títulos en orden. Los valorados van además en `rows` (Vistas + nota). */
    list?: { name: string; items: ImdbRow[] };
}

/** Nombre de la colección: el del fichero sin «.csv». Si IMDb lo nombró con su id, uno genérico. */
export function imdbListName(fileName: string): string {
    const base = fileName.split('/').pop()!.replace(/\.csv$/i, '').replace(/[_]+/g, ' ').trim();
    return !base || /^(ls\d+|[0-9a-f-]{20,})$/i.test(base) ? 'Lista de IMDb' : base.slice(0, 80);
}

// «Title Type» en el formato nuevo («TV Mini Series») y en el viejo («tvMiniSeries»), sin espacios
// ni mayúsculas para compararlos igual.
const IGNORED_TYPES = new Set(['tvepisode', 'videogame', 'podcastseries', 'podcastepisode', 'musicvideo']);
const SERIES_TYPES = new Set(['tvseries', 'tvminiseries']);

function normType(t: string): string {
    return t.toLowerCase().replace(/[^a-z]/g, '');
}

/** «2023-05-12», o lo que entienda `Date.parse` en exportaciones viejas. */
function isoDate(v: string | undefined): string | undefined {
    if (!v) return undefined;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

/** Qué fichero es, por sus columnas (y por el nombre para distinguir la watchlist de una lista). */
export function detectImdbKind(headers: string[], fileName: string): ImdbFileKind {
    const h = new Set(headers);
    if (!h.has('Const')) return 'unknown';
    if (h.has('Position')) return /watchlist/i.test(fileName) ? 'watchlist' : 'list';
    if (h.has('Your Rating')) return 'ratings';
    return 'unknown';
}

export function parseImdbExport(text: string, fileName: string): ImdbFile {
    const { headers, rows } = parseCsv(text);
    const kind = detectImdbKind(headers, fileName);
    const out: ImdbFile = { kind, rows: [], ignored: 0, invalid: 0 };
    if (kind === 'unknown') return out;
    if (kind === 'list') out.list = { name: imdbListName(fileName), items: [] };

    const seen = new Set<string>();
    for (const r of rows) {
        const imdb = r['Const'];
        if (!/^tt\d{5,10}$/.test(imdb ?? '')) { out.invalid++; continue; }
        const type = normType(r['Title Type'] ?? '');
        if (IGNORED_TYPES.has(type)) { out.ignored++; continue; }
        if (seen.has(imdb)) continue;
        seen.add(imdb);

        const row: ImdbRow = {
            imdb,
            title: r['Title'] || r['Original Title'] || imdb,
            year: Number(r['Year']) || null,
            type: SERIES_TYPES.has(type) ? 'tv' : 'movie',
            kind: kind === 'ratings' ? 'seen' : kind === 'list' ? 'list' : 'watchlist',
        };
        if (kind === 'list') {
            // Estar en una lista no dice que la hayas visto: solo a la colección. Si además la
            // valoraste (las listas traen «Your Rating»), también a Vistas con tu nota.
            out.list!.items.push(row);
            const score = Number(r['Your Rating']);
            if (score >= 1 && score <= 10) out.rows.push({ ...row, kind: 'seen', rating: score, date: isoDate(r['Date Rated']) });
            continue;
        }
        if (kind === 'ratings') {
            const score = Number(r['Your Rating']);
            if (score >= 1 && score <= 10) row.rating = score;
            row.date = isoDate(r['Date Rated']);
        } else {
            row.date = isoDate(r['Created']);
        }
        out.rows.push(row);
    }
    return out;
}
