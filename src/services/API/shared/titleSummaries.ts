/**
 * Título, póster y año de una lista de títulos de TMDB, con caché por título.
 *
 * Lo usa el perfil público: sus secciones automáticas guardan solo `tmdb_id` (las listas, el
 * diario y las notas no copian el título), así que hay que pedírselo a TMDB. Un perfil frío pide
 * como mucho ~30 títulos; luego todo sale de aquí.
 *
 * Caché L1 por instancia (12 h) y por idioma: el título sale en el idioma del VISITANTE. Un título
 * que TMDB no devuelve se queda fuera (no se pinta una tarjeta vacía).
 */
import { tmdbFetch } from './tmdbClient';
import { toItem } from './summaryItem';
import { processBatch } from '../../../utils/processBatch';
import { getCurrentLanguage } from '../../BD/shared/userScope';

export interface TitleRef {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
}

export interface TitleSummary {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    year: string | null;
    /** Solo series: nº de temporadas (sin especiales). */
    seasons: number | null;
    /** Solo películas: duración en minutos. */
    runtime: number | null;
    /** Solo series: episodios de cada temporada (sin especiales), para «Vas por T2 E3». */
    seasonEpisodes: Record<number, number> | null;
}

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { data: TitleSummary | null; expires: number }>();

export const titleKey = (r: TitleRef) => `${r.media_type}:${r.tmdb_id}`;

async function fetchOne(ref: TitleRef, lang: string): Promise<TitleSummary | null> {
    const key = `${lang}:${titleKey(ref)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;
    let data: TitleSummary | null = null;
    try {
        const raw = await tmdbFetch<any>(`/${ref.media_type}/${ref.tmdb_id}`);
        const item = toItem(raw, ref.media_type);
        if (item) {
            const real = ref.media_type === 'tv' && Array.isArray(raw?.seasons)
                ? raw.seasons.filter((s: any) => (s?.season_number ?? 0) > 0)
                : null;
            const seasons = real ? real.length || (raw.number_of_seasons ?? null) : null;
            const seasonEpisodes = real
                ? Object.fromEntries(real.map((s: any) => [s.season_number, Number(s.episode_count) || 0]))
                : null;
            const runtime = ref.media_type === 'movie' && Number(raw?.runtime) > 0 ? Number(raw.runtime) : null;
            data = {
                media_type: ref.media_type, tmdb_id: ref.tmdb_id, title: item.title, poster_path: item.poster_path, year: item.year,
                seasons, runtime, seasonEpisodes,
            };
        }
    } catch {
        // TMDB caído o título borrado: no se cachea el fallo mucho tiempo, que vuelva a intentarlo.
        cache.set(key, { data: null, expires: Date.now() + 5 * 60 * 1000 });
        return null;
    }
    cache.set(key, { data, expires: Date.now() + TTL_MS });
    return data;
}

/** Devuelve un mapa `movie:550 → resumen` con los que TMDB haya podido dar. */
export async function getTitleSummaries(refs: TitleRef[]): Promise<Map<string, TitleSummary>> {
    const lang = getCurrentLanguage();
    const unique = Array.from(new Map(refs.map((r) => [titleKey(r), r])).values());
    const results = await processBatch(unique, (r) => fetchOne(r, lang), 8);
    const out = new Map<string, TitleSummary>();
    for (const r of results) if (r) out.set(titleKey(r), r);
    return out;
}
