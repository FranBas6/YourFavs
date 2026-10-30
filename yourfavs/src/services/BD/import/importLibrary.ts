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
 * misma razón no se escriben pases en el diario: IMDb no dice cuándo la viste.
 */
import { db, fetchAll, requireAuthId } from '../shared/userScope';

export type ImportSource = 'imdb' | 'letterboxd' | 'tmdb';

export interface ImportItem {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    kind: 'seen' | 'watchlist';
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

interface Ops {
    add: { collection: string; tmdb_id: number; added_at: string | null; rating: number | null }[];
    remove: { collection: string; tmdb_id: number }[];
    rate: { media_type: 'movie' | 'tv'; tmdb_id: number; score: number; at: string | null }[];
}

const SEEN = { movie: 'MoviesVistas', tv: 'SeriesVistas' } as const;
const WATCHLIST = { movie: 'MoviesPendientes', tv: 'SeriesPendiente' } as const;
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
 * título que viene dos veces (en ratings y en la watchlist) se resuelve como si fueran seguidas.
 */
export function planImport(items: ImportItem[], state: Map<string, TitleState>): Ops {
    const ops: Ops = { add: [], remove: [], rate: [] };
    for (const it of items) {
        const mt = it.media_type;
        const s = state.get(`${mt}:${it.tmdb_id}`)!;
        const at = dateToTs(it.date);

        if (it.rating && !s.rated) {
            ops.rate.push({ media_type: mt, tmdb_id: it.tmdb_id, score: it.rating, at });
            s.rated = true;
            s.rating = it.rating;
        }

        if (it.kind === 'seen') {
            if (KEEP_ON_SEEN[mt].some((c) => s.collections.has(c))) continue;
            ops.add.push({ collection: SEEN[mt], tmdb_id: it.tmdb_id, added_at: at, rating: s.rating });
            for (const c of CLEARED_BY_SEEN[mt]) {
                if (s.collections.delete(c)) ops.remove.push({ collection: c, tmdb_id: it.tmdb_id });
            }
            s.collections.add(SEEN[mt]);
        } else {
            if (KEEP_ON_WATCHLIST[mt].some((c) => s.collections.has(c))) continue;
            ops.add.push({ collection: WATCHLIST[mt], tmdb_id: it.tmdb_id, added_at: at, rating: s.rating });
            s.collections.add(WATCHLIST[mt]);
        }
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

/** Aplica un lote de una importación. Devuelve lo que de verdad cambió. */
export async function applyImportBatch(jobId: string, items: ImportItem[]): Promise<{ added: number; removed: number; rated: number }> {
    const userId = requireAuthId();
    const state = await loadState(userId, items);
    const ops = planImport(items, state);
    if (!ops.add.length && !ops.remove.length && !ops.rate.length) return { added: 0, removed: 0, rated: 0 };
    const { data, error } = await db().rpc('import_apply', { p_job: jobId, p_ops: ops as any });
    if (error) throw new Error(error.message);
    await invalidateLibraryCaches();
    return data as { added: number; removed: number; rated: number };
}

export async function undoImport(jobId: string): Promise<{ removed: number; restored: number; unrated: number }> {
    requireAuthId();
    const { data, error } = await db().rpc('import_undo', { p_job: jobId });
    if (error) throw new Error(error.message);
    await invalidateLibraryCaches();
    return data as { removed: number; restored: number; unrated: number };
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
