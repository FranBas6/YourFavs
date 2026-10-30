/**
 * Disponibilidad por temporada de una serie, con caché.
 *
 * Por qué existe: `/tv/{id}/watch/providers` devuelve la UNIÓN de todas las temporadas, así que
 * "Naruto está en Netflix y Prime" es verdad a medias — Prime solo tiene T1-T3. Para poder decir
 * *hasta dónde* llega cada plataforma hay que pedir las temporadas una a una, y eso son N
 * llamadas a TMDB por ficha. La caché (L1 memoria + L2 Netlify Blobs, 24 h) es lo que lo paga:
 * los catálogos cambian de mes en mes, no de minuto en minuto.
 */
import { getSeasonWatchProviders } from './InfoSeries';
import { getCached, setCached } from '../../../utils/recsBlobCache';

const TTL_MS = 24 * 60 * 60 * 1000;

export interface SeasonProviders {
    providersByCountry: Record<string, any[]>;
    linkByCountry: Record<string, string>;
}
/** número de temporada → sus providers por país */
export type SeasonProviderMap = Record<number, SeasonProviders>;

// L1: memoria del proceso (una Lambda caliente sirve varias peticiones sin tocar Blobs).
const mem = new Map<string, { data: SeasonProviderMap; expires: number }>();

/**
 * Providers de TODAS las temporadas indicadas, en paralelo. Una sola entrada de caché por
 * serie (una lectura y una escritura, no N).
 */
export async function getAllSeasonProviders(
    serieId: string | number,
    seasons: number[],
): Promise<SeasonProviderMap> {
    if (seasons.length === 0) return {};
    // v2 (B4b): los proveedores incluyen también «gratis» y «con anuncios»; las entradas v1 no los traían.
    const key = `wp_v2_tv_${serieId}`;

    const hot = mem.get(key);
    if (hot && hot.expires > Date.now()) return hot.data;

    const cold = await getCached<SeasonProviderMap>(key);
    if (cold) {
        // Solo vale si cubre las temporadas que pide la ficha (una serie puede haber estrenado
        // una temporada nueva desde que se cacheó).
        if (seasons.every((s) => cold[s] !== undefined)) {
            mem.set(key, { data: cold, expires: Date.now() + TTL_MS });
            return cold;
        }
    }

    const results = await Promise.all(seasons.map((s) => getSeasonWatchProviders(serieId, s)));
    const map: SeasonProviderMap = {};
    seasons.forEach((s, i) => { map[s] = results[i]; });

    mem.set(key, { data: map, expires: Date.now() + TTL_MS });
    setCached(key, map, TTL_MS).catch(() => { /* sin L2 se sigue funcionando */ });
    return map;
}

/**
 * Cobertura por proveedor: país → provider_id → temporadas en las que está **incluido en
 * suscripción**. Solo `flatrate` a propósito: la pregunta que responde el badge es "¿hasta qué
 * temporada me la cubre mi plataforma?", y contar alquileres haría que un proveedor que pasa a
 * ser de pago en la última temporada pareciese cubrirla.
 */
export function buildProviderCoverage(map: SeasonProviderMap): Record<string, Record<number, number[]>> {
    const out: Record<string, Record<number, number[]>> = {};
    const seasonNums = Object.keys(map).map(Number).sort((a, b) => a - b);
    for (const s of seasonNums) {
        const byCountry = map[s]?.providersByCountry || {};
        for (const [country, list] of Object.entries(byCountry)) {
            for (const p of list) {
                if (p.type !== 'flatrate') continue;
                const c = (out[country] ??= {});
                (c[p.provider_id] ??= []).push(s);
            }
        }
    }
    return out;
}
