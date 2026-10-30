/**
 * Importar la biblioteca (TMDB D3). Aquí se decide qué hace cada título importado y se escribe con
 * `import_apply` (migración `20261105090000_import_jobs`), que lo hace en una transacción y apunta
 * cada cambio para poder deshacer la importación entera.
 *
 * Reglas (acordadas con Fran el 2026-10-30), las mismas de `stateTransitions.ts` con dos cuidados:
 *   · NUNCA baja de nivel ni corta lo que estás haciendo. «Visto» solo saca el título de Pendientes
 *     y Ver pronto; si lo estás viendo (película) o siguiendo / lo abandonaste (serie), se deja.
 *   · Tu nota manda: la importada solo entra donde no tenías ninguna.
 * Fechas: cada título entra con su fecha original (cuándo lo valoraste o lo añadiste), no con la de
 * hoy, para que «Mes a mes» y «Tu cine en números» no digan que este mes viste 800 películas. Por la
 * misma razón solo hay pases en el diario cuando el origen dice CUÁNDO la viste (el diario de
 * Letterboxd, D3b); IMDb no lo dice.
 *
 * Me gusta y Favoritos (Letterboxd, D3b) siguen el modelo de dos capas: implican Vistas, se excluyen
 * entre sí y Favoritos está por encima (nunca se baja de Favoritos a Me gusta).
 */
import { db, fetchAll, requireAuthId } from '../shared/userScope';

export type ImportSource = 'imdb' | 'letterboxd' | 'tmdb';

export interface ImportItem {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    kind: 'seen' | 'liked' | 'favorite' | 'watchlist';
    /** 1-10, ya en nuestra escala. */
    rating?: number;
    /** YYYY-MM-DD */
    date?: string;
}

export interface ImportJob {
    id: string;
    source: ImportSource;
    label: string;
    file_hash: string | null;
    totals: Record<string, number>;
    created_at: string;
    undone_at: string | null;
}

/** Un pase del diario con su día real (D3b). */
export interface ImportLog {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    watched_on: string;
    rewatch: boolean;
}

/** Un título para una colección propia (D3b). */
export interface ImportListed {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
}

interface Ops {
    add: { collection: string; tmdb_id: number; added_at: string | null; rating: number | null }[];
    remove: { collection: string; tmdb_id: number }[];
    rate: { media_type: 'movie' | 'tv'; tmdb_id: number; score: number; at: string | null }[];
    log?: ImportLog[];
    listed?: (ImportListed & { list_id: string; position: number })[];
}

const SEEN = { movie: 'MoviesVistas', tv: 'SeriesVistas' } as const;
const WATCHLIST = { movie: 'MoviesPendientes', tv: 'SeriesPendiente' } as const;
const LIKED = { movie: 'LikedMovies', tv: 'LikedSeries' } as const;
const FAVS = { movie: 'MovieFavs', tv: 'SeriesFavs' } as const;
/** Lo que estás viendo, siguiendo o dejaste: la importación no lo mueve (ni a Vistas, ni a opinión). */
const IN_PROGRESS = { movie: ['MoviesViendo'], tv: ['SeriesSiguiendo', 'SeriesAbandonadas'] };
/** Lo que «visto» limpia: solo el progreso de «quiero verla». */
const CLEARED_BY_SEEN = { movie: ['MoviesPendientes', 'MoviesVerPronto'], tv: ['SeriesPendiente', 'SeriesVerPronto'] };
/** Si está en alguna de estas, «visto» no toca las listas (ya está vista o la estás viendo). */
const KEEP_ON_SEEN = {
    movie: ['MoviesVistas', 'MovieFavs', 'LikedMovies', 'MoviesViendo'],
    tv: ['SeriesVistas', 'SeriesFavs', 'LikedSeries', 'SeriesSiguiendo', 'SeriesAbandonadas'],
};
/** Si está en alguna de estas, la watchlist no la añade a Pendientes. */
const KEEP_ON_WATCHLIST = {
    movie: ['MoviesPendientes', 'MoviesVerPronto', 'MoviesViendo', 'MoviesVistas', 'MovieFavs', 'LikedMovies'],
    tv: ['SeriesPendiente', 'SeriesVerPronto', 'SeriesSiguiendo', 'SeriesAbandonadas', 'SeriesVistas', 'SeriesFavs', 'LikedSeries'],
};

/** Mediodía en Madrid aprox.: la fecha se lee igual en cualquier zona. */
const dateToTs = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : null);

interface TitleState { collections: Set<string>; rated: boolean; rating: number | null }

/** En qué listas está cada título del lote y si ya tiene nota: dos consultas para todo el lote. */
async function loadState(userId: string, items: ImportItem[]): Promise<Map<string, TitleState>> {
    const ids = [...new Set(items.map((i) => i.tmdb_id))];
    const state = new Map<string, TitleState>();
    const get = (mt: string, id: number) => {
        const k = `${mt}:${id}`;
        let s = state.get(k);
        if (!s) { s = { collections: new Set(), rated: false, rating: null }; state.set(k, s); }
        return s;
    };
    if (!ids.length) return state;
    const [lib, rat] = await Promise.all([
        db().from('library_items').select('collection, media_type, tmdb_id, rating').eq('user_id', userId).in('tmdb_id', ids),
        db().from('ratings').select('media_type, tmdb_id').eq('user_id', userId).in('tmdb_id', ids),
    ]);
    if (lib.error) throw new Error(lib.error.message);
    if (rat.error) throw new Error(rat.error.message);
    for (const r of lib.data ?? []) {
        const s = get(r.media_type, r.tmdb_id);
        s.collections.add(r.collection);
        if (r.rating !== null) { s.rated = true; s.rating = Number(r.rating); }
    }
    for (const r of rat.data ?? []) get(r.media_type, r.tmdb_id).rated = true;
    // Los títulos que no estaban en ninguna parte también necesitan su estado (vacío).
    for (const i of items) get(i.media_type, i.tmdb_id);
    return state;
}

/**
 * Lo que hará un lote, título a título. El estado se actualiza en memoria según se decide, así un
 * título que viene dos veces (en ratings y en la watchlist) se resuelve como si fueran seguidas. Si
 * una decisión quita algo que el mismo lote acababa de añadir, se retira el alta en vez de apuntar
 * una baja (deshacer no tendría nada que devolver).
 */
export function planImport(items: ImportItem[], state: Map<string, TitleState>): Ops {
    const ops: Ops = { add: [], remove: [], rate: [] };
    const addedHere = new Set<string>();

    for (const it of items) {
        const mt = it.media_type;
        const id = it.tmdb_id;
        const s = state.get(`${mt}:${id}`)!;
        const at = dateToTs(it.date);
        const add = (collection: string) => {
            ops.add.push({ collection, tmdb_id: id, added_at: at, rating: s.rating });
            s.collections.add(collection);
            addedHere.add(`${collection}:${id}`);
        };
        const remove = (collection: string) => {
            if (!s.collections.delete(collection)) return;
            if (addedHere.delete(`${collection}:${id}`)) {
                ops.add = ops.add.filter((a) => !(a.collection === collection && a.tmdb_id === id));
            } else {
                ops.remove.push({ collection, tmdb_id: id });
            }
        };

        if (it.rating && !s.rated) {
            ops.rate.push({ media_type: mt, tmdb_id: id, score: it.rating, at });
            s.rated = true;
            s.rating = it.rating;
            for (const a of ops.add) if (a.tmdb_id === id && a.rating === null) a.rating = it.rating;
        }

        if (it.kind === 'watchlist') {
            if (KEEP_ON_WATCHLIST[mt].some((c) => s.collections.has(c))) continue;
            add(WATCHLIST[mt]);
            continue;
        }
        if (IN_PROGRESS[mt].some((c) => s.collections.has(c))) continue;

        // Visto, Me gusta o Favoritos: todos son «visto» y sacan de Pendientes / Ver pronto.
        const opinion = it.kind === 'favorite' ? FAVS[mt] : it.kind === 'liked' ? LIKED[mt] : null;
        if (s.collections.has(FAVS[mt])) continue;                        // ya en lo más alto
        if (opinion === LIKED[mt] && s.collections.has(LIKED[mt])) continue;
        if (!opinion && KEEP_ON_SEEN[mt].some((c) => s.collections.has(c))) continue;

        if (opinion) {
            if (opinion === FAVS[mt]) remove(LIKED[mt]);                  // Favoritos sustituye a Me gusta
            add(opinion);
        }
        if (!s.collections.has(SEEN[mt])) add(SEEN[mt]);
        for (const c of CLEARED_BY_SEEN[mt]) remove(c);
    }
    return ops;
}

/** Las cachés que dependen de tus listas (las mismas que vacía marcar a mano en la ficha). */
async function invalidateLibraryCaches(): Promise<void> {
    // Rutas fijas (Vite solo empaqueta los `import()` que puede leer) y cada una por su lado: si una
    // falla, esa caché caduca sola.
    await Promise.allSettled([
        import('../../API/shared/collectionsDiscovery').then((m) => m.invalidateUserCollectionsCache()),
        import('../../../utils/yearStats').then((m) => m.invalidateYearStatsCache()),
        import('../../../utils/genrePreferences').then((m) => m.invalidateGenrePreferencesCache()),
        import('../../../utils/personalRecommendations').then((m) => m.invalidatePersonalRecsCache()),
        import('../../../utils/topActorsLibrary').then((m) => m.invalidateTopActorsCache()),
        import('../shared/personalIndex').then((m) => m.invalidatePersonalIndexCache()),
        import('../shared/librarySnapshot').then((m) => m.invalidateLibrarySnapshot()),
        import('../shared/activityFeed').then((m) => m.invalidateActivityFeed()),
    ]);
}

export async function createImportJob(input: {
    source: ImportSource; label: string; fileHash: string | null; totals: Record<string, number>;
}): Promise<string> {
    const userId = requireAuthId();
    const { data, error } = await db().from('import_jobs')
        .insert({ user_id: userId, source: input.source, label: input.label.slice(0, 120), file_hash: input.fileHash, totals: input.totals })
        .select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
}

/**
 * Aplica un lote de una importación: títulos (con las reglas de arriba), pases del diario y títulos
 * de una colección ya creada (`createImportList`). Devuelve lo que de verdad cambió.
 */
export async function applyImportBatch(jobId: string, batch: {
    items?: ImportItem[];
    log?: ImportLog[];
    list?: { id: string; items: ImportListed[] };
}): Promise<Record<string, number>> {
    const userId = requireAuthId();
    const items = batch.items ?? [];
    const ops = planImport(items, await loadState(userId, items));
    if (batch.log?.length) ops.log = batch.log;
    if (batch.list?.items.length) {
        const { data: last, error } = await db().from('custom_list_items').select('position')
            .eq('user_id', userId).eq('list_id', batch.list.id)
            .order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        if (error) throw new Error(error.message);
        const from = Number(last?.position) || 0;
        ops.listed = batch.list.items.map((it, i) => ({ ...it, list_id: batch.list!.id, position: from + i + 1 }));
    }
    if (!ops.add.length && !ops.remove.length && !ops.rate.length && !ops.log?.length && !ops.listed?.length) {
        return { added: 0, removed: 0, rated: 0, logged: 0, listed: 0 };
    }
    const { data, error } = await db().rpc('import_apply', { p_job: jobId, p_ops: ops as any });
    if (error) throw new Error(error.message);
    await invalidateLibraryCaches();
    return data as Record<string, number>;
}

/**
 * La colección propia donde entra una lista importada. Si ya la creó una importación anterior (que
 * no deshiciste) con ese nombre, se reutiliza: reimportar la completa en vez de duplicarla. Si tienes
 * una TUYA con ese nombre, la importada se llama «Nombre (Letterboxd)» para no mezclarlas.
 */
export async function createImportList(jobId: string, input: {
    name: string; description: string; suffix: string; cover: { poster_path: string; tmdb_id: number } | null;
}): Promise<{ id: string; reused: boolean }> {
    const userId = requireAuthId();
    const { cleanName, createList } = await import('../lists/customLists');
    const base = cleanName(input.name) || 'Lista importada';
    const suffixed = cleanName(`${base} (${input.suffix})`);

    const { data: lists, error } = await db().from('custom_lists').select('id, name')
        .eq('user_id', userId).in('name', [base, suffixed]);
    if (error) throw new Error(error.message);
    const imported = new Set<string>();
    if (lists?.length) {
        const { data: made, error: e2 } = await db().from('import_job_changes')
            .select('prev, import_jobs!inner(undone_at)')
            .eq('user_id', userId).eq('kind', 'list').is('import_jobs.undone_at', null);
        if (e2) throw new Error(e2.message);
        for (const m of made ?? []) imported.add(String((m.prev as any)?.list_id));
    }
    // Apuntada como 'list' para que deshacer pueda borrarla (si sigue vacía).
    const create = async (name: string): Promise<{ id: string; reused: boolean }> => {
        const id = await createList({
            name, description: input.description, icon: '🎞️', colorStamp: 'slate',
            cover: input.cover ? { type: 'poster', ...input.cover } : null,
        });
        const { error: e3 } = await db().from('import_job_changes').insert({
            user_id: userId, job_id: jobId, kind: 'list', media_type: 'movie', tmdb_id: 0, prev: { list_id: id },
        });
        if (e3) throw new Error(e3.message);
        return { id, reused: false };
    };
    for (const name of [base, suffixed]) {
        const hit = lists?.find((l) => l.name === name);
        if (!hit) return create(name);
        if (imported.has(hit.id)) return { id: hit.id, reused: true };
    }
    // Tienes tuyas con los dos nombres: la importada lleva además la fecha.
    return create(cleanName(`${suffixed} ${new Date().toISOString().slice(0, 10)}`));
}

export async function undoImport(jobId: string): Promise<Record<string, number>> {
    requireAuthId();
    const { data, error } = await db().rpc('import_undo', { p_job: jobId });
    if (error) throw new Error(error.message);
    await invalidateLibraryCaches();
    return data as Record<string, number>;
}

/** Tus importaciones, la última primero. */
export async function listImportJobs(): Promise<ImportJob[]> {
    const userId = requireAuthId();
    const rows = await fetchAll<Record<string, any>>((from, to) =>
        db().from('import_jobs').select('id, source, label, file_hash, totals, created_at, undone_at')
            .eq('user_id', userId).order('created_at', { ascending: false }).order('id').range(from, to),
    );
    return rows as ImportJob[];
}
