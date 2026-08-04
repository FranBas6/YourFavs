/**
 * Catálogo de plataformas de streaming de una región (TMDB `/watch/providers/{movie,tv}`).
 *
 * Existe para que el usuario pueda añadir CUALQUIER plataforma que tenga (Crunchyroll, MUBI,
 * SkyShowtime…) en vez de elegir entre siete fijas. Los dos endpoints no devuelven lo mismo
 * (en España, 79 para cine y 68 para series, con 19 exclusivas de cine y 8 de series), así que
 * se unen y se deduplican por `provider_id`.
 *
 * El perfil sigue guardando SOLO ids (`number[]`): el documento `users/{uid}` lo lee el
 * middleware en cada request y no conviene engordarlo con nombres y rutas de logo. El nombre y
 * el logo se resuelven desde aquí, y esto se cachea de verdad (memoria + Netlify Blobs, 7 días)
 * porque un catálogo de plataformas cambia de mes en mes, no de minuto en minuto.
 */
import { tmdbFetch } from './tmdbClient';
import { getCached, setCached } from '../../../utils/recsBlobCache';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface WatchProviderOption {
    id: number;
    name: string;
    logo_path: string | null;
    /** Orden que sugiere TMDB para la región (0 = más relevante). */
    priority: number;
    /** Complemento contratado DENTRO de otra plataforma ("MUBI Amazon Channel"). */
    channel: boolean;
    /**
     * Plataforma que lo aloja, para poder decirlo con precisión. No siempre es Prime: hay
     * canales de Apple TV ("AMC Plus Apple TV Channel") y de Roku. `null` si no es un canal.
     */
    channelHost: string | null;
    /**
     * Nombre sin el sufijo de canal ("Crunchyroll Amazon Channel" → "Crunchyroll"). Es contra
     * ESTO contra lo que busca el selector: si se buscara sobre el nombre completo, teclear
     * "amazon" devolvería las 27 variantes y enterraría Prime Video.
     */
    base: string;
}

interface RawProvider {
    provider_id: number;
    provider_name: string;
    logo_path?: string | null;
    display_priority?: number;
}

// L1: memoria del proceso (una Lambda caliente sirve varias peticiones sin tocar Blobs).
const mem = new Map<string, { data: WatchProviderOption[]; expires: number }>();

/**
 * Un tercio del catálogo español son variantes "X Amazon Channel": no son plataformas aparte,
 * son canales que se contratan dentro de Prime. Se marcan para esconderlas de la lista por
 * defecto sin dejar de encontrarlas al buscar.
 *
 * Anclado al FINAL a propósito: con un `\bchannel\b` suelto, plataformas legítimas de otras
 * regiones (Channel 4 en Reino Unido, por ejemplo) se marcarían como complementos. El plural
 * también es intencionado: TMDB no es consistente ("Lionsgate+ Amazon Channels").
 */
const CHANNEL_SUFFIX = /\s+(amazon|apple\s*tv|roku(?:\s+premium)?)\s+channels?$/i;

/** Nombre presentable de la plataforma anfitriona, a partir de lo que captura el sufijo. */
function hostOf(captured: string): string {
    const k = captured.toLowerCase().replace(/\s+/g, '');
    if (k.startsWith('roku')) return 'Roku';
    if (k.startsWith('appletv')) return 'Apple TV';
    return 'Prime Video';
}

export async function getRegionProviders(region: string): Promise<WatchProviderOption[]> {
    // OJO: subir la versión de la clave no es solo cosa de cambiar la FORMA del objeto —
    // también hay que hacerlo al cambiar cómo se CLASIFICA. La caché vive 7 días, así que una
    // entrada guardada con la lógica vieja seguiría sirviendo etiquetas equivocadas una semana.
    //   v2 → se añadió `base`
    //   v3 → arreglada la detección de canal (recorte previo, plural) + `channelHost`
    const key = `wp_catalog_v3_${region}`;

    const hot = mem.get(key);
    if (hot && hot.expires > Date.now()) return hot.data;

    const cold = await getCached<WatchProviderOption[]>(key);
    if (cold && cold.length > 0) {
        mem.set(key, { data: cold, expires: Date.now() + TTL_MS });
        return cold;
    }

    const [movie, tv] = await Promise.all([
        tmdbFetch<{ results?: RawProvider[] }>('/watch/providers/movie', { watch_region: region }).catch(() => ({ results: [] })),
        tmdbFetch<{ results?: RawProvider[] }>('/watch/providers/tv', { watch_region: region }).catch(() => ({ results: [] })),
    ]);

    const byId = new Map<number, WatchProviderOption>();
    for (const p of [...(movie.results ?? []), ...(tv.results ?? [])]) {
        if (!p?.provider_id || byId.has(p.provider_id)) continue;
        // Recortar ANTES de mirar el sufijo: varios nombres de TMDB traen un espacio al final
        // ("Movistar Plus+ Ficción Total "), y comparando contra el nombre sin recortar el
        // propio `.trim()` bastaba para marcarlos como variantes de canal.
        const name = p.provider_name.trim();
        const hit = name.match(CHANNEL_SUFFIX);
        const base = hit ? name.slice(0, hit.index).trim() : name;
        byId.set(p.provider_id, {
            id: p.provider_id,
            name,
            logo_path: p.logo_path ?? null,
            priority: p.display_priority ?? 999,
            channel: Boolean(hit),
            channelHost: hit ? hostOf(hit[1]) : null,
            base: base || name,
        });
    }

    const list = Array.from(byId.values()).sort(
        (a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'es'),
    );

    // Si TMDB falló en las dos llamadas no se cachea el vacío: mejor reintentar luego que
    // dejar el selector muerto una semana.
    if (list.length > 0) {
        mem.set(key, { data: list, expires: Date.now() + TTL_MS });
        setCached(key, list, TTL_MS).catch(() => { /* sin L2 se sigue funcionando */ });
    }
    return list;
}

/**
 * Nombre y logo de los ids que tiene guardados el usuario. Un id que ya no esté en el
 * catálogo (plataforma retirada, o cambio de región) se devuelve con un nombre de reserva en
 * vez de desaparecer: si no, el ajuste se "perdería" sin explicación.
 */
export async function resolveProviderNames(
    ids: number[],
    region: string,
): Promise<Map<number, WatchProviderOption>> {
    const out = new Map<number, WatchProviderOption>();
    if (ids.length === 0) return out;
    const catalog = await getRegionProviders(region).catch(() => [] as WatchProviderOption[]);
    const byId = new Map(catalog.map((p) => [p.id, p]));
    for (const id of ids) {
        const fallback: WatchProviderOption = {
            id, name: `Plataforma ${id}`, logo_path: null, priority: 999,
            channel: false, channelHost: null, base: `Plataforma ${id}`,
        };
        out.set(id, byId.get(id) ?? fallback);
    }
    return out;
}

/** Límites del campo `platforms`, compartidos por el endpoint y el POST de reserva. */
export const MAX_PLATFORMS = 40;

/**
 * Saneado de la lista de ids.
 *
 * A propósito NO se valida contra el catálogo de TMDB: eso metería una llamada de red en el
 * camino de guardado y, si TMDB estuviese caído, borraría las plataformas del usuario en
 * silencio. Un id inventado no hace daño — `with_watch_providers` simplemente no encuentra
 * nada — así que basta con exigir enteros positivos, deduplicar y poner un techo.
 */
export function sanitizePlatformIds(raw: unknown[]): number[] {
    const seen = new Set<number>();
    for (const v of raw) {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) continue;
        seen.add(n);
        if (seen.size >= MAX_PLATFORMS) break;
    }
    return Array.from(seen);
}
