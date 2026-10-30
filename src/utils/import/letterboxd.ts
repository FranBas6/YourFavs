/**
 * Exportación de Letterboxd (TMDB D3b): Ajustes → Data → Export your data da un ZIP con
 *
 *   watched.csv            Date, Name, Year, Letterboxd URI
 *   ratings.csv            Date, Name, Year, Letterboxd URI, Rating      (0,5 – 5 estrellas)
 *   watchlist.csv          Date, Name, Year, Letterboxd URI
 *   diary.csv              Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
 *   likes/films.csv        Date, Name, Year, Letterboxd URI              (el corazón)
 *   profile.csv            …, Favorite Films                            (tus 4 del perfil, por URI)
 *   lists/<nombre>.csv     «Letterboxd list export v7», una fila con la lista y luego
 *                          Position, Name, Year, URL, Description
 *
 * Letterboxd no da el id de TMDB: cada película se identifica por título y año, y así se busca en
 * TMDB (`/api/import/resolve`). La URI de una película (`boxd.it/…`) solo sirve aquí para casar las
 * favoritas del perfil con su título; la del diario es la de la entrada, no la de la película.
 *
 * Todo se reduce a UNA ficha por película con lo que dice cada fichero, y se decide su lista:
 * Favoritos > Me gusta > Vistas; Pendientes solo si no está vista.
 */
import { parseCsv } from './csv';

export interface LbFilm {
    key: string;
    name: string;
    year: number | null;
    seen: boolean;
    liked: boolean;
    favorite: boolean;
    watchlist: boolean;
    /** Ya en nuestra escala (estrellas × 2). */
    rating?: number;
    /** YYYY-MM-DD: el primer visionado que conste (diario) o cuándo la marcaste. */
    date?: string;
    /** YYYY-MM-DD: cuándo la apuntaste en la watchlist (la fecha con que entra en Pendientes). */
    watchlistDate?: string;
    diary: { date: string; rewatch: boolean }[];
}

export interface LbList {
    name: string;
    description: string;
    /** Claves de `films`, en el orden de la lista. */
    keys: string[];
}

export interface LbExport {
    films: Map<string, LbFilm>;
    lists: LbList[];
    /** Favoritas del perfil que no aparecen en ningún otro fichero (no hay título con que buscarlas). */
    favoritesUnmatched: number;
    /** Ficheros reconocidos, para enseñar qué se ha leído. */
    files: string[];
}

export const filmKey = (name: string, year: number | null) => `${name.trim().toLowerCase()}|${year ?? ''}`;
const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const earliest = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);

/** Carpeta y nombre de un fichero del ZIP (`letterboxd-x/lists/top.csv` → `lists`, `top.csv`). */
function where(path: string): { parent: string; file: string } {
    const segs = path.toLowerCase().split('/');
    const file = segs.pop() ?? '';
    return { parent: segs.pop() ?? '', file };
}

/** Las carpetas `deleted/` y `orphaned/` son lo que borraste en Letterboxd: no se importan. */
const SKIPPED = new Set(['deleted', 'orphaned']);
const TOP_FILES = new Set(['watched.csv', 'ratings.csv', 'watchlist.csv', 'diary.csv', 'profile.csv']);

/** ¿Es un fichero de Letterboxd que sabemos leer? (por su ruta dentro del ZIP) */
export function isLetterboxdPath(path: string): boolean {
    const { parent, file } = where(path);
    if (SKIPPED.has(parent) || !file.endsWith('.csv')) return false;
    if (parent === 'lists') return true;
    if (parent === 'likes') return file === 'films.csv';
    return TOP_FILES.has(file);
}

/** ¿Este CSV suelto es de Letterboxd? (cabecera con «Letterboxd URI» o exportación de lista) */
export function looksLikeLetterboxd(text: string): boolean {
    const head = text.slice(0, 400);
    return head.includes('Letterboxd URI') || head.includes('Letterboxd list export');
}

/**
 * `files`: ruta (dentro del ZIP, o nombre del CSV suelto) → contenido. Los CSV sueltos se reconocen
 * por el nombre (`watched.csv`…); una lista suelta, por su primera línea.
 */
export function parseLetterboxdExport(files: Map<string, string>): LbExport {
    const films = new Map<string, LbFilm>();
    const byUri = new Map<string, string>();
    const read: string[] = [];

    const film = (name: string, yearRaw: string, uri?: string): LbFilm | null => {
        const n = (name ?? '').trim();
        if (!n) return null;
        const year = Number(yearRaw) || null;
        const key = filmKey(n, year);
        let f = films.get(key);
        if (!f) {
            f = { key, name: n, year, seen: false, liked: false, favorite: false, watchlist: false, diary: [] };
            films.set(key, f);
        }
        if (uri) byUri.set(uri.trim(), key);
        return f;
    };

    const entries = [...files.entries()].filter(([p]) => !SKIPPED.has(where(p).parent));
    const get = (name: string) => entries.find(([p]) => {
        const w = where(p);
        return w.file === name && w.parent !== 'lists' && w.parent !== 'likes';
    });

    const watched = get('watched.csv');
    if (watched) {
        read.push('watched.csv');
        for (const r of parseCsv(watched[1]).rows) {
            const f = film(r['Name'], r['Year'], r['Letterboxd URI']);
            if (f) { f.seen = true; f.date = earliest(f.date, isoDate(r['Date'])); }
        }
    }
    const ratings = get('ratings.csv');
    if (ratings) {
        read.push('ratings.csv');
        for (const r of parseCsv(ratings[1]).rows) {
            const f = film(r['Name'], r['Year'], r['Letterboxd URI']);
            const stars = Number(r['Rating']);
            if (f && stars > 0 && stars <= 5) { f.rating = stars * 2; f.seen = true; f.date = earliest(f.date, isoDate(r['Date'])); }
        }
    }
    const diary = get('diary.csv');
    if (diary) {
        read.push('diary.csv');
        for (const r of parseCsv(diary[1]).rows) {
            const f = film(r['Name'], r['Year']);
            const date = isoDate(r['Watched Date']) ?? isoDate(r['Date']);
            if (!f || !date) continue;
            f.seen = true;
            f.diary.push({ date, rewatch: /^yes$/i.test(r['Rewatch'] ?? '') });
            f.date = earliest(f.date, date);
        }
    }
    const likes = entries.find(([p]) => where(p).parent === 'likes' && where(p).file === 'films.csv');
    if (likes) {
        read.push('likes/films.csv');
        for (const r of parseCsv(likes[1]).rows) {
            const f = film(r['Name'], r['Year'], r['Letterboxd URI']);
            if (f) { f.liked = true; f.date = earliest(f.date, isoDate(r['Date'])); }
        }
    }
    const watchlist = get('watchlist.csv');
    if (watchlist) {
        read.push('watchlist.csv');
        for (const r of parseCsv(watchlist[1]).rows) {
            const f = film(r['Name'], r['Year'], r['Letterboxd URI']);
            if (f) { f.watchlist = true; f.watchlistDate = isoDate(r['Date']); }
        }
    }

    // Favoritas del perfil: URIs separadas por comas; se casan con las películas ya leídas.
    let favoritesUnmatched = 0;
    const profile = get('profile.csv');
    if (profile) {
        read.push('profile.csv');
        const raw = parseCsv(profile[1]).rows[0]?.['Favorite Films'] ?? '';
        for (const uri of raw.split(',').map((u) => u.trim()).filter(Boolean)) {
            const key = byUri.get(uri);
            const f = key ? films.get(key) : undefined;
            if (f) f.favorite = true;
            else favoritesUnmatched++;
        }
    }

    // Listas: primera línea «Letterboxd list export v…», luego la lista (Date, Name, Tags, URL,
    // Description), una línea en blanco y los títulos (Position, Name, Year, URL, Description).
    const lists: LbList[] = [];
    for (const [path, text] of entries) {
        const isList = where(path).parent === 'lists' || text.replace(/^\ufeff/, '').startsWith('Letterboxd list export');
        if (!isList) continue;
        const parsed = parseListExport(text);
        if (!parsed) continue;
        const keys: string[] = [];
        for (const r of parsed.rows) {
            const f = film(r['Name'], r['Year']);
            if (f && !keys.includes(f.key)) keys.push(f.key);
        }
        if (keys.length) {
            lists.push({ name: parsed.name || path.split('/').pop()!.replace(/\.csv$/i, ''), description: parsed.description, keys });
            read.push(`lists/${path.split('/').pop()}`);
        }
    }

    return { films, lists, favoritesUnmatched, files: read };
}

function parseListExport(text: string): { name: string; description: string; rows: Record<string, string>[] } | null {
    const src = text.replace(/^﻿/, '');
    const at = src.search(/^Position,/m);
    if (at < 0) return null;
    const head = src.slice(0, at).split(/\r?\n/).slice(1).join('\n');   // sin «Letterboxd list export v7»
    const meta = parseCsv(head).rows[0] ?? {};
    return { name: meta['Name'] ?? '', description: meta['Description'] ?? '', rows: parseCsv(src.slice(at)).rows };
}
