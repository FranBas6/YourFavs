/**
 * Ajustes → «Importar» (TMDB D3): el navegador hace casi todo.
 *
 *   1 · Lee los ficheros: CSV de IMDb (`utils/import/imdb.ts`) o ZIP / CSV de Letterboxd
 *       (`utils/import/zip.ts` + `letterboxd.ts`). Se reconoce el origen solo. O, al volver de
 *       aprobar el permiso en themoviedb.org (`?tmdb=ok`), lee la cuenta de TMDB página a página
 *       (`/api/import/tmdb/fetch`) y revoca el permiso en cuanto termina (D3c).
 *   2 · Busca cada título UNA vez en TMDB, por lotes de 50 (`/api/import/resolve`): IMDb por id
 *       exacto; Letterboxd por título y año, con «dudosos» para elegir.
 *   3 · Vista previa: cifras, a qué lista va cada cosa, pósters, dudosos y no encontrados.
 *   4 · Aplica por lotes (`/api/import/jobs` + `/api/import/apply`): títulos, pases del diario y
 *       colecciones. Las reglas de qué va dónde están en el servidor (`importLibrary.ts`).
 * Y «Deshacer» en cada importación (`/api/import/undo`).
 */
import { showToast } from '../social/toast';
import { fileHash } from '../../utils/import/csv';
import { parseImdbExport, type ImdbRow } from '../../utils/import/imdb';
import { isLetterboxdPath, looksLikeLetterboxd, parseLetterboxdExport, type LbExport, type LbFilm } from '../../utils/import/letterboxd';
import { readZipTexts } from '../../utils/import/zip';

type Source = 'imdb' | 'letterboxd' | 'tmdb';

const RESOLVE_BATCH = 50;
const APPLY_BATCH = 200;
const LOG_BATCH = 300;
const MAX_ROWS = 10_000;
const POSTER = 'https://image.tmdb.org/t/p/w92';
const SOURCE_LABEL: Record<Source, string> = { imdb: 'IMDb', letterboxd: 'Letterboxd', tmdb: 'TMDB' };

const count = (v: number, one: string, many: string) => `${v.toLocaleString('es-ES')} ${v === 1 ? one : many}`;
const num = (v: number) => v.toLocaleString('es-ES');

/** Un título a buscar: la clave con la que vuelve la respuesta y lo que se manda. */
interface Lookup { key: string; label: string; req: Record<string, unknown> }
interface Candidate { tmdb_id: number; title: string; year: number | null; poster_path: string | null }
interface Resolved {
    status: 'found' | 'ambiguous' | 'missing';
    media_type?: 'movie' | 'tv';
    tmdb_id?: number;
    title?: string;
    year?: number | null;
    poster_path?: string | null;
    have?: boolean;
    candidates?: Candidate[];
}

/** Lo leído de la cuenta de TMDB (D3c): un título por `media_type:id` y las listas. */
interface TmdbTitle {
    media_type: 'movie' | 'tv'; tmdb_id: number; title: string; year: number | null; poster_path: string | null;
    have: boolean; favorite: boolean; watchlist: boolean; rating?: number; rated_on?: string;
}
interface TmdbAccount {
    titles: Map<string, TmdbTitle>;
    lists: { name: string; description: string; items: { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null }[] }[];
}

/** El título ya elegido (encontrado, o candidata pulsada en un dudoso). */
interface Pick { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null; have: boolean }

const root = document.querySelector<HTMLElement>('[data-imp]');
if (root) init(root);
initUndo();

function init(root: HTMLElement) {
    const known: Record<string, string> = JSON.parse(root.dataset.known || '{}');
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const input = $<HTMLInputElement>('[data-imp-file]');
    const drop = $<HTMLLabelElement>('[data-imp-drop]');
    const pickMsg = $<HTMLParagraphElement>('[data-imp-pick-msg]');

    // Estado de la importación en curso.
    let source: Source = 'imdb';
    let label = '';
    let hash: string | null = null;
    let ignored = 0;
    let imdbRows: ImdbRow[] = [];
    /** Listas propias de IMDb (F1), una colección por fichero. */
    let imdbLists: { name: string; items: ImdbRow[] }[] = [];
    let lb: LbExport | null = null;
    let tmdb: TmdbAccount | null = null;
    let lookups: Lookup[] = [];
    const results = new Map<string, Resolved>();
    /** Dudosos: clave → tmdb_id elegido (o null = «Ninguna»). */
    const choices = new Map<string, number | null>();

    const show = (stage: string) => {
        root.querySelectorAll<HTMLElement>('[data-imp-stage]').forEach((el) => { el.hidden = el.dataset.impStage !== stage; });
    };
    const progress = (title: string, done: number, total: number) => {
        $('[data-imp-prog-t]').textContent = title;
        const pct = total ? Math.round((done / total) * 100) : 0;
        $('[data-imp-bar-fill]').style.width = `${pct}%`;
        $('[data-imp-bar]').setAttribute('aria-valuenow', String(pct));
        $('[data-imp-prog-d]').textContent = `${num(done)} de ${num(total)}`;
    };
    const pickError = (msg: string) => { pickMsg.textContent = msg; pickMsg.hidden = false; show('pick'); };

    async function post<T>(url: string, body: unknown): Promise<T> {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || String(r.status));
        return j as T;
    }

    // --- 1 · Leer los ficheros ---------------------------------------------------
    // Nunca falla en silencio: sin ficheros (arrastrados desde el editor, que solo pasa la ruta)
    // o con un error inesperado, se dice qué ha pasado bajo la zona de soltar.
    async function handleFiles(files: File[]) {
        pickMsg.hidden = true;
        if (!files.length) {
            return pickError('No ha llegado ningún fichero. Arrástralo desde el Finder (desde un editor no funciona) o pulsa en el recuadro para elegirlo.');
        }
        try {
            await readFiles(files);
        } catch (err) {
            console.error('[importar]', err);
            pickError('No se ha podido leer el fichero. Prueba otra vez o elígelo pulsando en el recuadro.');
        }
    }

    async function readFiles(files: File[]) {
        // Contenido de cada fichero (los ZIP, abiertos) y de qué origen parece.
        const texts = new Map<string, string>();
        let lbCount = 0;
        for (const f of files) {
            if (/\.zip$/i.test(f.name) || f.type.includes('zip')) {
                const inner = await readZipTexts(f, isLetterboxdPath);
                if (!inner.size) return pickError(`«${f.name}» no parece una exportación de Letterboxd.`);
                for (const [p, t] of inner) texts.set(p, t);
                lbCount++;
            } else {
                const t = await f.text();
                texts.set(f.name, t);
                if (looksLikeLetterboxd(t)) lbCount++;
            }
        }
        if (lbCount && lbCount !== files.length) return pickError('Importa IMDb y Letterboxd por separado: primero unos ficheros y luego los otros.');
        source = lbCount ? 'letterboxd' : 'imdb';
        label = files.map((f) => f.name).join(' + ');
        hash = await fileHash([...texts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, t]) => `${p}\n${t}`).join('\n'));
        return source === 'imdb' ? readImdb(texts) : readLetterboxd(texts);
    }

    async function readImdb(texts: Map<string, string>) {
        const rows: ImdbRow[] = [];
        const lists: { name: string; items: ImdbRow[] }[] = [];
        ignored = 0;
        for (const [name, text] of texts) {
            const parsed = parseImdbExport(text, name);
            if (parsed.list?.items.length) lists.push(parsed.list);
            if (parsed.kind === 'unknown') {
                return pickError(`«${name}» no parece una exportación de IMDb ni de Letterboxd. Busca ratings.csv, WATCHLIST.csv o el ZIP de Letterboxd.`);
            }
            rows.push(...parsed.rows);
            ignored += parsed.ignored + parsed.invalid;
        }
        const all = [...rows, ...lists.flatMap((l) => l.items)];
        if (!all.length) return pickError('No hay películas ni series en esos ficheros.');
        if (all.length > MAX_ROWS) return pickError(`Son ${num(all.length)} filas; el máximo es ${num(MAX_ROWS)}.`);
        imdbRows = rows;
        imdbLists = lists;
        lb = null;
        lookups = [...new Map(all.map((r) => [r.imdb, r])).values()].map((r) => ({
            key: r.imdb, label: r.year ? `${r.title} (${r.year})` : r.title, req: { imdb: r.imdb, type: r.type },
        }));
        await resolveAll();
    }

    async function readLetterboxd(texts: Map<string, string>) {
        const parsed = parseLetterboxdExport(texts);
        if (!parsed.films.size) return pickError('No hay películas en esos ficheros de Letterboxd.');
        if (parsed.films.size > MAX_ROWS) return pickError(`Son ${num(parsed.films.size)} películas; el máximo es ${num(MAX_ROWS)}.`);
        lb = parsed;
        imdbRows = [];
        imdbLists = [];
        ignored = parsed.favoritesUnmatched;
        lookups = [...parsed.films.values()].map((f) => ({
            key: f.key, label: f.year ? `${f.name} (${f.year})` : f.name, req: { key: f.key, name: f.name, year: f.year },
        }));
        await resolveAll();
    }

    // --- 1b · Leer la cuenta de TMDB (D3c) ------------------------------------------------
    async function readTmdbAccount() {
        show('progress');
        const acc: TmdbAccount = { titles: new Map(), lists: [] };
        const STEPS: [string, string][] = [
            ['movie_favorites', 'favoritos'], ['tv_favorites', 'series favoritas'],
            ['movie_rated', 'valoraciones'], ['tv_rated', 'series valoradas'],
            ['movie_watchlist', 'watchlist'], ['tv_watchlist', 'series en tu watchlist'],
        ];
        let step = 0;
        const total = STEPS.length + 1;
        const title = (what: string) => `Leyendo tu cuenta de TMDB: ${what}…`;

        /** Todas las páginas de algo. */
        const all = async (kind: string, extra: Record<string, unknown> = {}) => {
            const out: any[] = [];
            let lists: any[] = [];
            for (let page = 1, pages = 1; page <= pages; page++) {
                const r = await post<any>('/api/import/tmdb/fetch', { kind, page, ...extra });
                pages = Math.min(Number(r.total_pages) || 1, 500);
                out.push(...(r.titles ?? []));
                if (r.lists) lists = lists.concat(r.lists);
            }
            return { titles: out, lists };
        };
        const entry = (t: any): TmdbTitle => {
            const k = `${t.media_type}:${t.tmdb_id}`;
            const known = acc.titles.get(k);
            if (known) return known;
            // Solo los datos del título: la nota se apunta aparte, solo desde «valoradas».
            const e: TmdbTitle = {
                media_type: t.media_type, tmdb_id: t.tmdb_id, title: t.title, year: t.year,
                poster_path: t.poster_path, have: !!t.have, favorite: false, watchlist: false,
            };
            acc.titles.set(k, e);
            return e;
        };

        try {
            for (const [kind, what] of STEPS) {
                progress(title(what), step++, total);
                const { titles } = await all(kind);
                for (const t of titles) {
                    const e = entry(t);
                    if (kind.endsWith('favorites')) e.favorite = true;
                    if (kind.endsWith('watchlist')) e.watchlist = true;
                    if (kind.endsWith('rated') && t.rating) { e.rating = t.rating; e.rated_on = t.rated_on; }
                }
            }
            progress(title('listas'), step++, total);
            const { lists } = await all('lists');
            for (const l of lists) {
                const { titles } = await all('list', { list_id: l.id });
                acc.lists.push({
                    name: l.name, description: l.description,
                    items: titles.map((t: any) => {
                        entry(t); // para el «ya en tus listas» y los pósters
                        return { media_type: t.media_type, tmdb_id: t.tmdb_id, title: t.title, poster_path: t.poster_path };
                    }),
                });
            }
        } catch (err) {
            console.error('[importar] cuenta de TMDB', err);
            await disconnectTmdb();
            return pickError('No se ha podido leer tu cuenta de TMDB (la conexión dura 15 minutos). Vuelve a conectar.');
        }
        await disconnectTmdb();

        if (!acc.titles.size) return pickError('Tu cuenta de TMDB no tiene favoritos, valoraciones, watchlist ni listas que importar.');
        tmdb = acc;
        source = 'tmdb';
        label = 'Cuenta de TMDB';
        hash = null;
        ignored = 0;
        imdbRows = [];
        imdbLists = [];
        lb = null;
        results.clear();
        choices.clear();
        lookups = [];
        for (const [k, t] of acc.titles) {
            lookups.push({ key: k, label: t.year ? `${t.title} (${t.year})` : t.title, req: {} });
            results.set(k, { status: 'found', media_type: t.media_type, tmdb_id: t.tmdb_id, title: t.title, year: t.year, poster_path: t.poster_path, have: t.have });
        }
        renderPreview();
    }

    /** El permiso de TMDB no se queda vivo: se revoca en cuanto se ha leído (o si falla). */
    async function disconnectTmdb() {
        try { await fetch('/api/import/tmdb/disconnect', { method: 'POST' }); } catch { /* caduca en 15 min */ }
    }

    // --- 2 · Buscar en TMDB por lotes (cada título una vez) --------------------------
    async function resolveAll() {
        show('progress');
        results.clear();
        choices.clear();
        let pending: Lookup[] = [];
        let done = 0;
        progress('Buscando en TMDB…', 0, lookups.length);

        const runBatch = async (batch: Lookup[]) => {
            const res = await post<{ results: any[] }>('/api/import/resolve', { source, rows: batch.map((l) => l.req) });
            const byKey = new Map(res.results.map((x) => [x.imdb ?? x.key, x]));
            for (const l of batch) {
                const x = byKey.get(l.key);
                if (x && x.status !== 'error') results.set(l.key, x);
                else pending.push(l); // error o sin respuesta: se reintenta al final
            }
        };

        for (let i = 0; i < lookups.length; i += RESOLVE_BATCH) {
            const batch = lookups.slice(i, i + RESOLVE_BATCH);
            try { await runBatch(batch); } catch { pending.push(...batch); }
            done = Math.min(lookups.length, i + RESOLVE_BATCH);
            progress('Buscando en TMDB…', done, lookups.length);
        }
        // Un reintento para lo que falló (TMDB a veces devuelve un 5xx suelto).
        if (pending.length) {
            const retry = pending;
            pending = [];
            progress('Reintentando algunos…', done, lookups.length);
            for (let i = 0; i < retry.length; i += RESOLVE_BATCH) {
                const batch = retry.slice(i, i + RESOLVE_BATCH);
                try { await runBatch(batch); } catch { pending.push(...batch); }
            }
        }
        if (pending.length === lookups.length) return pickError('No se ha podido conectar con TMDB. Inténtalo de nuevo en un rato.');
        // Lo que sigue fallando cuenta como no encontrado (volver a importar el fichero lo completa).
        for (const l of pending) results.set(l.key, { status: 'missing' });
        renderPreview();
    }

    /** El título elegido para una clave: el encontrado, o la candidata pulsada en un dudoso. */
    function pickFor(key: string): Pick | null {
        const r = results.get(key);
        if (r?.status === 'found') return { media_type: r.media_type!, tmdb_id: r.tmdb_id!, title: r.title ?? '', poster_path: r.poster_path ?? null, have: !!r.have };
        if (r?.status === 'ambiguous') {
            const id = choices.get(key);
            const c = r.candidates?.find((x) => x.tmdb_id === id);
            if (c) return { media_type: 'movie', tmdb_id: c.tmdb_id, title: c.title, poster_path: c.poster_path, have: false };
        }
        return null;
    }

    // --- 3 · Vista previa ----------------------------------------------------------------
    function renderPreview() {
        const all = [...results.entries()];
        const found = all.filter(([, r]) => r.status === 'found');
        const amb = all.filter(([, r]) => r.status === 'ambiguous');
        const missing = lookups.filter((l) => results.get(l.key)?.status === 'missing');
        const set = (k: string, v: number) => { $(`[data-imp-n="${k}"]`).textContent = num(v); };
        set('found', found.length);
        set('have', found.filter(([, r]) => r.have).length);
        set('ambiguous', amb.length);
        set('missing', missing.length);
        set('ignored', ignored);
        $('[data-imp-stat-amb]').hidden = !amb.length;
        $('[data-imp-from]').textContent = source === 'tmdb' ? 'Tu cuenta de TMDB' : `${SOURCE_LABEL[source]} · ${label}`;

        renderDest();

        const posters = $('[data-imp-posters]');
        posters.innerHTML = '';
        for (const [, r] of found.filter(([, r]) => !r.have && r.poster_path).slice(0, 14)) {
            const img = document.createElement('img');
            img.src = `${POSTER}${r.poster_path}`;
            img.alt = '';
            img.loading = 'lazy';
            posters.append(img);
        }

        renderAmbiguous(amb);

        const miss = $<HTMLDetailsElement>('[data-imp-missing]');
        const list = $('[data-imp-missing-list]');
        list.innerHTML = '';
        miss.hidden = !missing.length;
        for (const m of missing.slice(0, 300)) {
            const el = document.createElement('li');
            el.textContent = m.label;
            list.append(el);
        }

        const dup = $('[data-imp-dup]');
        const prev = hash ? known[hash] : undefined;
        dup.hidden = !prev;
        if (prev) $('[data-imp-dup-t]').textContent = `Ya importaste estos mismos ficheros el ${prev}. Si sigues, solo se añade lo que falte.`;

        show('preview');
    }

    /** A dónde va cada cosa. Se recalcula al elegir en los dudosos. */
    function renderDest() {
        const plan = buildPlan();
        const by = (k: string) => plan.items.filter((i) => i.kind === k);
        const rated = plan.items.filter((i) => i.rating).length;
        const dest = $('[data-imp-dest]');
        dest.innerHTML = '';
        const li = (title: string, detail: string) => {
            const el = document.createElement('li');
            const b = document.createElement('b');
            b.textContent = title;
            el.append(b, document.createTextNode(` · ${detail}`));
            dest.append(el);
        };
        // «películas» si lo son todas (Letterboxd); si hay series (cuenta de TMDB), «títulos».
        const what = (list: PlanItem[]) => list.every((i) => i.media_type === 'movie')
            ? count(list.length, 'película', 'películas')
            : count(list.length, 'título', 'títulos');
        if (by('favorite').length) li('Favoritos', what(by('favorite')));
        if (by('liked').length) li('Me gusta', what(by('liked')));
        if (by('seen').length) li('Vistas', count(by('seen').length, 'título', 'títulos'));
        if (rated) li('Notas', `${num(rated)} (las tuyas mandan)`);
        if (by('watchlist').length) li('Pendientes', count(by('watchlist').length, 'título', 'títulos'));
        if (plan.log.length) li('Diario', count(plan.log.length, 'pase con su fecha', 'pases con su fecha'));
        if (plan.lists.length) {
            const items = plan.lists.reduce((s, l) => s + l.items.length, 0);
            // Con los nombres: en IMDb salen del fichero y conviene verlos antes de aplicar.
            const names = plan.lists.slice(0, 4).map((l) => `«${l.name}» (${num(l.items.length)})`).join(', ')
                + (plan.lists.length > 4 ? ` y ${count(plan.lists.length - 4, 'más', 'más')}` : '');
            li('Colecciones', `${count(plan.lists.length, 'lista', 'listas')} con ${count(items, 'título', 'títulos')}: ${names}`);
        }
        $<HTMLButtonElement>('[data-imp-apply]').disabled = !plan.items.length && !plan.log.length && !plan.lists.length;
    }

    function renderAmbiguous(amb: [string, Resolved][]) {
        const box = $('[data-imp-amb]');
        const list = $('[data-imp-amb-list]');
        list.innerHTML = '';
        box.hidden = !amb.length;
        for (const [key, r] of amb) {
            const look = lookups.find((l) => l.key === key);
            const row = document.createElement('div');
            row.className = 'aj-imp-amb-row';
            const t = document.createElement('p');
            t.className = 'aj-imp-amb-t';
            t.textContent = look?.label ?? key;
            const opts = document.createElement('div');
            opts.className = 'aj-imp-amb-opts';
            const choose = (id: number | null, btn: HTMLButtonElement) => {
                const same = choices.get(key) === id;
                choices.set(key, same ? null : id);
                opts.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
                if (!same) btn.setAttribute('aria-pressed', 'true');
                renderDest();
            };
            for (const c of r.candidates ?? []) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'aj-imp-cand';
                b.setAttribute('aria-pressed', 'false');
                const img = document.createElement('img');
                img.alt = '';
                img.loading = 'lazy';
                if (c.poster_path) img.src = `${POSTER}${c.poster_path}`;
                const name = document.createElement('span');
                name.className = 'aj-imp-cand-t';
                name.textContent = c.title;
                const year = document.createElement('span');
                year.className = 'aj-imp-cand-y';
                year.textContent = c.year ? String(c.year) : '—';
                b.append(img, name, year);
                b.addEventListener('click', () => choose(c.tmdb_id, b));
                opts.append(b);
            }
            const none = document.createElement('button');
            none.type = 'button';
            none.className = 'aj-imp-cand is-none';
            none.setAttribute('aria-pressed', 'false');
            none.textContent = 'Ninguna';
            none.addEventListener('click', () => { choices.set(key, null); opts.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === none))); renderDest(); });
            opts.append(none);
            row.append(t, opts);
            list.append(row);
        }
    }

    // --- 4 · Qué se manda: títulos, diario y colecciones -------------------------------
    interface PlanItem { media_type: 'movie' | 'tv'; tmdb_id: number; kind: string; rating?: number; date?: string }
    interface PlanLog { media_type: 'movie' | 'tv'; tmdb_id: number; date: string; rewatch: boolean }
    interface PlanList { name: string; description: string; items: { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null }[] }

    function buildPlan(): { items: PlanItem[]; log: PlanLog[]; lists: PlanList[] } {
        const items: PlanItem[] = [];
        const log: PlanLog[] = [];
        const lists: PlanList[] = [];
        const opt = (rating?: number, date?: string) => ({ ...(rating ? { rating } : {}), ...(date ? { date } : {}) });

        if (source === 'imdb') {
            const seen = new Set<string>();
            for (const row of imdbRows) {
                const p = pickFor(row.imdb);
                if (!p) continue;
                const k = `${p.media_type}:${p.tmdb_id}:${row.kind}`;
                if (seen.has(k)) continue;
                seen.add(k);
                items.push({ media_type: p.media_type, tmdb_id: p.tmdb_id, kind: row.kind, ...opt(row.rating, row.date) });
            }
            for (const l of imdbLists) {
                const ids = new Set<string>();
                const its: PlanList['items'] = [];
                for (const row of l.items) {
                    const p = pickFor(row.imdb);
                    if (!p || ids.has(`${p.media_type}:${p.tmdb_id}`)) continue;
                    ids.add(`${p.media_type}:${p.tmdb_id}`);
                    its.push({ media_type: p.media_type, tmdb_id: p.tmdb_id, title: p.title, poster_path: p.poster_path });
                }
                if (its.length) lists.push({ name: l.name, description: '', items: its });
            }
            return { items, log, lists };
        }

        // Cuenta de TMDB: ya viene un título por id; Favoritos > Vistas (valorada) > Pendientes.
        if (source === 'tmdb') {
            for (const t of tmdb!.titles.values()) {
                const kind = t.favorite ? 'favorite' : t.rating ? 'seen' : t.watchlist ? 'watchlist' : null;
                if (kind) items.push({ media_type: t.media_type, tmdb_id: t.tmdb_id, kind, ...opt(t.rating, kind === 'watchlist' ? undefined : t.rated_on) });
            }
            for (const l of tmdb!.lists) if (l.items.length) lists.push(l);
            return { items, log, lists };
        }

        // Letterboxd: una ficha por película → una sola lista (Favoritos > Me gusta > Vistas; Pendientes
        // solo si no está vista). Dos películas del fichero pueden ser la misma en TMDB: gana la más alta.
        const rank: Record<string, number> = { favorite: 3, liked: 2, seen: 1, watchlist: 0 };
        const best = new Map<number, PlanItem>();
        const film = (f: LbFilm) => (f.favorite ? 'favorite' : f.liked ? 'liked' : f.seen ? 'seen' : f.watchlist ? 'watchlist' : null);
        for (const f of lb!.films.values()) {
            const p = pickFor(f.key);
            if (!p) continue;
            const kind = film(f);
            if (kind) {
                const prev = best.get(p.tmdb_id);
                if (!prev || rank[kind] > rank[prev.kind]) {
                    const date = kind === 'watchlist' ? f.watchlistDate : f.date;
                    best.set(p.tmdb_id, { media_type: 'movie', tmdb_id: p.tmdb_id, kind, ...opt(f.rating ?? prev?.rating, date) });
                }
            }
            for (const d of f.diary) log.push({ media_type: 'movie', tmdb_id: p.tmdb_id, date: d.date, rewatch: d.rewatch });
        }
        items.push(...best.values());
        for (const l of lb!.lists) {
            const ids = new Set<number>();
            const its: PlanList['items'] = [];
            for (const key of l.keys) {
                const p = pickFor(key);
                if (!p || ids.has(p.tmdb_id)) continue;
                ids.add(p.tmdb_id);
                its.push({ media_type: p.media_type, tmdb_id: p.tmdb_id, title: p.title, poster_path: p.poster_path });
            }
            if (its.length) lists.push({ name: l.name, description: l.description, items: its });
        }
        return { items, log, lists };
    }

    // --- 5 · Aplicar -----------------------------------------------------------------------
    async function apply() {
        const plan = buildPlan();
        const total = plan.items.length + plan.log.length + plan.lists.reduce((s, l) => s + l.items.length, 0);
        const found = [...results.values()].filter((r) => r.status === 'found').length + [...choices.values()].filter((v) => v != null).length;
        const missing = [...results.values()].filter((r) => r.status === 'missing').length;
        show('progress');
        progress('Añadiendo a tus listas…', 0, total);

        let jobId: string;
        try {
            jobId = (await post<{ id: string }>('/api/import/jobs', {
                source, label, file_hash: hash,
                totals: { rows: lookups.length + ignored, found, missing, ignored },
            })).id;
        } catch {
            show('preview');
            return showToast('No se ha podido empezar. Inténtalo de nuevo.', 'error');
        }

        const sum = { added: 0, removed: 0, rated: 0, logged: 0, listed: 0 };
        let failed = 0;
        let done = 0;
        const send = async (body: Record<string, unknown>, size: number): Promise<any> => {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const r = await post<any>('/api/import/apply', { job_id: jobId, ...body });
                    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += Number(r[k]) || 0;
                    done += size;
                    progress('Añadiendo a tus listas…', Math.min(done, total), total);
                    return r;
                } catch { /* un reintento */ }
            }
            failed += size;
            done += size;
            return null;
        };

        for (let i = 0; i < plan.items.length; i += APPLY_BATCH) {
            const batch = plan.items.slice(i, i + APPLY_BATCH);
            await send({ items: batch }, batch.length);
        }
        for (let i = 0; i < plan.log.length; i += LOG_BATCH) {
            const batch = plan.log.slice(i, i + LOG_BATCH);
            await send({ log: batch }, batch.length);
        }
        for (const l of plan.lists) {
            let listId = '';
            for (let i = 0; i < l.items.length; i += APPLY_BATCH) {
                const batch = l.items.slice(i, i + APPLY_BATCH);
                const r = await send({ list: { id: listId || undefined, source, name: l.name, description: l.description, items: batch } }, batch.length);
                if (r?.list_id) listId = r.list_id;
                else if (!listId) { failed += l.items.length - batch.length; break; } // sin colección no hay dónde seguir
            }
        }

        const parts: string[] = [];
        if (sum.added) parts.push(count(sum.added, 'título añadido', 'títulos añadidos'));
        if (sum.rated) parts.push(count(sum.rated, 'nota', 'notas'));
        if (sum.logged) parts.push(count(sum.logged, 'pase en el diario', 'pases en el diario'));
        if (sum.listed) parts.push(`${num(sum.listed)} en ${count(plan.lists.length, 'colección', 'colecciones')}`);
        $('[data-imp-done-t]').textContent = parts.length
            ? `Hecho: ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0]}.`
            : 'No había nada nuevo que añadir.';
        const details: string[] = [];
        if (sum.removed) details.push(`${count(sum.removed, 'salió', 'salieron')} de Pendientes o Me gusta al subir de nivel.`);
        const skipped = plan.items.length - sum.added;
        if (skipped > 0) details.push(`${count(skipped, 'título ya estaba', 'títulos ya estaban')} en tus listas.`);
        if (failed) details.push(`${count(failed, 'cosa no se ha', 'cosas no se han')} podido guardar; vuelve a importar el fichero para completarlo.`);
        $('[data-imp-done-d]').textContent = details.join(' ');
        show('done');
        prependJob(jobId, sum, missing);
        if (hash) known[hash] = 'hoy';
    }

    // La fila nueva en «Tus importaciones», sin recargar.
    function prependJob(id: string, sum: Record<string, number>, missing: number) {
        const hist = document.querySelector<HTMLElement>('[data-imp-history]');
        const list = document.querySelector<HTMLElement>('[data-imp-jobs]');
        const tpl = document.querySelector<HTMLTemplateElement>('[data-imp-job-tpl]');
        if (!hist || !list || !tpl) return;
        const row = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
        row.dataset.job = id;
        row.querySelector('.aj-row-title')!.textContent = `${SOURCE_LABEL[source]} · ${label}`;
        const bits = [count(sum.added, 'añadido', 'añadidos')];
        if (sum.rated) bits.push(count(sum.rated, 'nota', 'notas'));
        if (sum.logged) bits.push(count(sum.logged, 'pase', 'pases'));
        if (sum.listed) bits.push(`${num(sum.listed)} en colecciones`);
        if (missing) bits.push(`${num(missing)} sin encontrar`);
        row.querySelector('.aj-row-desc')!.textContent = `Hoy · ${bits.join(' · ')}`;
        const undo = row.querySelector<HTMLButtonElement>('[data-imp-undo]')!;
        if (Object.values(sum).some((v) => v > 0)) undo.dataset.impUndo = id;
        else undo.remove();
        list.prepend(row);
        hist.hidden = false;
    }

    input.addEventListener('change', () => { handleFiles([...(input.files ?? [])]); input.value = ''; });

    // Se puede soltar en cualquier parte de la página mientras se está eligiendo: si no, un fichero
    // que cae un poco fuera del recuadro lo abre o lo descarga el navegador.
    const picking = () => !root.querySelector<HTMLElement>('[data-imp-stage="pick"]')!.hidden;
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => {
        if (!picking()) return;
        e.preventDefault();
        dragDepth++;
        drop.classList.add('is-over');
    });
    document.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) drop.classList.remove('is-over');
    });
    document.addEventListener('dragover', (e) => { if (picking()) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
        if (!picking()) return;
        e.preventDefault();
        dragDepth = 0;
        drop.classList.remove('is-over');
        handleFiles([...(e.dataTransfer?.files ?? [])]);
    });
    // Vuelta desde themoviedb.org: se lee la cuenta sola, o se dice por qué no.
    const tmdbState = new URLSearchParams(location.search).get('tmdb');
    if (tmdbState) {
        history.replaceState(null, '', location.pathname);
        if (tmdbState === 'ok') readTmdbAccount();
        else if (tmdbState === 'denied') showToast('No se ha dado permiso en TMDB: no se ha leído nada.', 'error');
        else showToast('No se ha podido conectar con TMDB. Inténtalo de nuevo en un rato.', 'error');
    }

    $('[data-imp-cancel]').addEventListener('click', () => show('pick'));
    $('[data-imp-apply]').addEventListener('click', apply);
    $('[data-imp-again]').addEventListener('click', () => show('pick'));
}

// --- Deshacer una importación ------------------------------------------------------------
function initUndo() {
    const dlg = document.getElementById('imp-undo-dlg') as HTMLDialogElement | null;
    const okBtn = dlg?.querySelector<HTMLButtonElement>('[data-imp-undo-confirm]');
    let undoId: string | null = null;

    document.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-imp-undo]');
        if (!b || !dlg || !b.dataset.impUndo) return;
        undoId = b.dataset.impUndo;
        dlg.showModal();
    });
    dlg?.querySelector('[data-imp-undo-cancel]')?.addEventListener('click', () => dlg.close());
    dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    okBtn?.addEventListener('click', async () => {
        if (!undoId) return;
        okBtn.disabled = true;
        try {
            const r = await fetch('/api/import/undo', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: undoId }),
            });
            const j = await r.json().catch(() => null);
            if (!r.ok || !j?.ok) throw new Error(String(r.status));
            const row = document.querySelector<HTMLElement>(`[data-job="${undoId}"]`);
            row?.querySelector('[data-imp-undo]')?.remove();
            const desc = row?.querySelector('.aj-row-desc');
            if (desc) desc.textContent = `${desc.textContent?.split(' · ')[0]} · Deshecha hoy`;
            dlg?.close();
            showToast(`Importación deshecha: ${count(Number(j.removed) || 0, 'título quitado', 'títulos quitados')}.`);
        } catch {
            dlg?.close();
            showToast('No se ha podido deshacer. Inténtalo de nuevo.', 'error');
        } finally {
            okBtn.disabled = false;
        }
    });
}
