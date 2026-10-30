/**
 * Detalles de TMDB (`/movie/{id}`, `/tv/{id}`) para muchos títulos a la vez, guardados SOLO mientras
 * TMDB dice que son válidos (C4 del plan TMDB, 2026-10-29). Tabla `tmdb_cache`.
 *
 * La regla de Fran es que las listas muestren siempre lo último de TMDB. TMDB sirve estas fichas
 * desde su CDN con `Cache-Control: max-age` (hoy de 2 a 7 h) y `Age`: mientras no caduca, pedírsela
 * otra vez devuelve EXACTAMENTE la misma respuesta. Por eso cada respuesta se guarda hasta ese
 * momento y ni un segundo más (`tmdbFetchWithFreshness`), y una respuesta sin cabecera de caché no
 * se guarda. Lo que sale de aquí es lo mismo que daría `fetchMovieDetails` / `fetchSerieDetails`.
 *
 * Una fila por título e idioma, compartida por todos los usuarios (dato público). Se lee y escribe
 * con la clave secreta, solo en servidor (la tabla no tiene políticas, como `app_state`). Si la
 * tabla falla, se cae al camino de siempre: pedirlo todo a TMDB.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getCurrentLanguage } from '../../BD/shared/userScope';
import { processBatch } from '../../../utils/processBatch';
import { tmdbFetchWithFreshness, type MediaType } from './tmdbClient';

/** Llamadas a TMDB a la vez. Con 10 (lo de antes) 180 fichas sin caché de TMDB tardaban 6-7 s; con 30, ~5 s y sin 429. */
const CONCURRENCY = 30;
/** Ids por consulta a la tabla (la lista va en la URL de PostgREST). */
const READ_CHUNK = 300;
/** Lo que caduca en menos de esto no compensa guardarlo. */
const MIN_FRESH_MS = 60_000;

/**
 * Detalle de cada id, en el mismo orden de entrada; `null` si TMDB no lo tiene o falla
 * (igual que `fetchMovieDetails` / `fetchSerieDetails`).
 */
export async function getTitleDetails(mediaType: MediaType, ids: (number | string)[]): Promise<(any | null)[]> {
    if (!ids.length) return [];
    const language = getCurrentLanguage();
    const numericIds = ids.map((id) => Number(id));
    const fresh = await readFresh(mediaType, language, numericIds);

    const missing = [...new Set(numericIds.filter((id) => !fresh.has(id)))];
    const fetched = await processBatch(missing, async (id: number) => {
        try {
            const { data, freshForMs } = await tmdbFetchWithFreshness<any>(`/${mediaType}/${id}`);
            return { id, data, freshForMs };
        } catch (error) {
            console.error(`❌ Error al obtener detalles de ${mediaType} ID ${id}:`, error);
            return { id, data: null, freshForMs: 0 };
        }
    }, CONCURRENCY);

    const toStore: { media_type: MediaType; tmdb_id: number; language: string; data: any; expires_at: string; fetched_at: string }[] = [];
    const now = Date.now();
    for (const r of fetched) {
        if (!r?.data) continue;
        fresh.set(r.id, r.data);
        if (r.freshForMs >= MIN_FRESH_MS) {
            toStore.push({
                media_type: mediaType,
                tmdb_id: r.id,
                language,
                data: r.data,
                expires_at: new Date(now + r.freshForMs).toISOString(),
                fetched_at: new Date(now).toISOString(),
            });
        }
    }
    if (toStore.length) await store(toStore);

    return numericIds.map((id) => fresh.get(id) ?? null);
}

/** Respuestas guardadas que aún no han caducado. Si la tabla falla, como si no hubiera ninguna. */
async function readFresh(mediaType: MediaType, language: string, ids: number[]): Promise<Map<number, any>> {
    const out = new Map<number, any>();
    const unique = [...new Set(ids)];
    const nowIso = new Date().toISOString();
    try {
        const chunks: number[][] = [];
        for (let i = 0; i < unique.length; i += READ_CHUNK) chunks.push(unique.slice(i, i + READ_CHUNK));
        const results = await Promise.all(chunks.map((chunk) =>
            supabaseAdmin().from('tmdb_cache')
                .select('tmdb_id, data')
                .eq('media_type', mediaType)
                .eq('language', language)
                .gt('expires_at', nowIso)
                .in('tmdb_id', chunk),
        ));
        for (const { data, error } of results) {
            if (error) throw new Error(error.message);
            for (const row of data ?? []) out.set(row.tmdb_id, row.data);
        }
    } catch (error) {
        console.warn('[tmdbTitleCache] lectura falló, se pide todo a TMDB:', (error as Error).message);
        out.clear();
    }
    return out;
}

/** Guarda (o renueva) las respuestas. Un fallo no rompe la página: la próxima vez se piden otra vez. */
async function store(rows: { media_type: MediaType; tmdb_id: number; language: string; data: any; expires_at: string; fetched_at: string }[]): Promise<void> {
    try {
        const { error } = await supabaseAdmin().from('tmdb_cache')
            .upsert(rows, { onConflict: 'media_type,tmdb_id,language' });
        if (error) throw new Error(error.message);
    } catch (error) {
        console.warn('[tmdbTitleCache] escritura falló:', (error as Error).message);
    }
}
