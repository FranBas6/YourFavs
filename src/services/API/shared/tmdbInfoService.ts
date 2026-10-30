import { tmdbFetch, type MediaType } from './tmdbClient';
import { getCurrentLanguage } from '../../BD/shared/userScope';

/** Idioma del perfil en ISO-639-1 (`es-ES` → `es`). */
const primaryLang = () => getCurrentLanguage().slice(0, 2);

/**
 * Idiomas de vídeo que pedimos a TMDB: el del perfil, inglés y «sin idioma».
 * Sin `include_video_language`, `/videos` devuelve SOLO los del `language` de la petición, y
 * muchísimos títulos no tienen tráiler en español (A1, 2026-10-29: 0 vídeos frente a 12).
 */
export const videoLanguages = () => {
    const p = primaryLang();
    return p === 'en' ? 'en,null' : `${p},en,null`;
};

interface VideoLike { site?: string; type?: string; key?: string; iso_639_1?: string | null; official?: boolean }

/**
 * Mejor tráiler de YouTube: idioma del perfil > inglés > resto; Trailer > Teaser; oficial > no.
 * La comparten las fichas (`getTrailer`) y la vista previa al pasar el ratón (`/api/videos`).
 */
export function pickBestTrailerKey(videos: VideoLike[]): string | null {
    const yt = (videos || []).filter(v => v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser'));
    if (yt.length === 0) return null;
    const own = primaryLang();
    const score = (v: VideoLike) =>
        (v.iso_639_1 === own ? 100 : v.iso_639_1 === 'en' ? 50 : 0)
        + (v.type === 'Trailer' ? 30 : 0)
        + (v.official ? 20 : 0);
    return [...yt].sort((a, b) => score(b) - score(a))[0].key!;
}

/** Vídeos en el idioma del perfil primero (TMDB los devuelve mezclados). */
export const ownLanguageFirst = (videos: any[]) => {
    const own = primaryLang();
    return [...videos].sort((a, b) => Number(b.iso_639_1 === own) - Number(a.iso_639_1 === own));
};

/** Junta reseñas del idioma del perfil (primero) y las inglesas, sin duplicar y con `lang`. */
export function mergeReviews(own: any[] | undefined, en: any[] | undefined): { results: any[] } {
    const ownLang = primaryLang();
    const seen = new Set<string>();
    const results: any[] = [];
    for (const [list, lang] of [[own, ownLang], [en, 'en']] as const) {
        for (const r of list || []) {
            if (!r?.id || seen.has(r.id)) continue;
            seen.add(r.id);
            results.push({ ...r, lang });
        }
    }
    return { results };
}

/**
 * Clasificación por edades de una PELÍCULA con la forma de `content_ratings` de las series
 * (`{iso_3166_1, rating}[]`), para que `getContentRating()` y la ficha sirvan igual.
 * En películas TMDB no tiene `content_ratings`: la edad va en `release_dates[].certification`.
 * Por país: la del estreno en cines (3), si no limitado (2), premiere (1) y luego el resto.
 */
export function movieCertifications(releaseDates: any): { iso_3166_1: string; rating: string }[] {
    const order = [3, 2, 1, 4, 5, 6];
    const out: { iso_3166_1: string; rating: string }[] = [];
    for (const country of releaseDates?.results || []) {
        const dated = (country.release_dates || [])
            .filter((d: any) => typeof d.certification === 'string' && d.certification.trim())
            .sort((a: any, b: any) => order.indexOf(a.type) - order.indexOf(b.type));
        if (dated.length) out.push({ iso_3166_1: country.iso_3166_1, rating: dated[0].certification.trim() });
    }
    return out;
}

/** Miembros del equipo con un `job` de la lista (forma `{name, job}` de `CrewGrid`). */
export function crewByRoles(crew: any[] | undefined, relevantRoles: string[]): { name: string; job: string }[] {
    return (crew || [])
        .filter((member: any) => relevantRoles.includes(member.job))
        .map((person: any) => ({ name: person.name, job: person.job }));
}

/**
 * La «info adicional» de una ficha a partir del detalle (con `release_dates` en película o
 * `content_ratings` en serie adjuntos) y sus keywords. La usan `getAdditionalInfo` y los paquetes
 * de ficha (`getMovieBundle`), así que las dos rutas dan exactamente lo mismo.
 */
export function buildAdditionalInfo(mediaType: MediaType, detailData: any, keywords: any[] | undefined): Record<string, any> {
    const base: Record<string, any> = {
        keywords: keywords || [],
        networks: detailData.networks || [],
        content_ratings: mediaType === 'movie'
            ? movieCertifications(detailData.release_dates)
            : detailData.content_ratings?.results || [],
        episode_run_time: detailData.episode_run_time || [],
        languages: detailData.spoken_languages || [],
        tagline: detailData.tagline || null,
    };
    // Campos exclusivos de películas
    if (mediaType === 'movie') {
        base.budget = detailData.budget || null;
        base.revenue = detailData.revenue || null;
    }
    return base;
}

/**
 * Lista curada de países soportados por el selector "Dónde ver" multi-región.
 * El primer país es el default (ES).
 */
export const SUPPORTED_COUNTRIES: { code: string; label: string }[] = [
    { code: 'ES', label: 'España' },
    { code: 'US', label: 'Estados Unidos' },
    { code: 'MX', label: 'México' },
    { code: 'AR', label: 'Argentina' },
    { code: 'CO', label: 'Colombia' },
    { code: 'CL', label: 'Chile' },
    { code: 'GB', label: 'Reino Unido' },
    { code: 'FR', label: 'Francia' },
    { code: 'DE', label: 'Alemania' },
    { code: 'IT', label: 'Italia' },
    { code: 'BR', label: 'Brasil' },
    { code: 'JP', label: 'Japón' },
];

/**
 * Convierte el campo `results` (por país) de TMDB watch/providers en un
 * diccionario ya deduplicado por país, filtrado a los países soportados.
 */
export function buildProvidersByCountry(rawResults: Record<string, any> | undefined) {
    const out: Record<string, ReturnType<typeof mapAndDeduplicateProviders>> = {};
    if (!rawResults) return out;
    for (const { code } of SUPPORTED_COUNTRIES) {
        const raw = rawResults[code];
        if (raw) {
            out[code] = mapAndDeduplicateProviders(raw);
        }
    }
    return out;
}

/**
 * Enlace JustWatch por país (results.{code}.link de watch/providers): página
 * del título con todos sus proveedores. Fallback de los enlaces por proveedor.
 */
export function buildProviderLinksByCountry(rawResults: Record<string, any> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!rawResults) return out;
    for (const { code } of SUPPORTED_COUNTRIES) {
        const link = rawResults[code]?.link;
        if (link) out[code] = link;
    }
    return out;
}

/** Tipos de disponibilidad de TMDB/JustWatch. `free` = gratis; `ads` = gratis con anuncios (B4b). */
export type ProviderType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

/**
 * Mapear y deduplicar proveedores de streaming (flatrate > free > ads > rent > buy).
 * Quien necesite solo suscripciones filtra `type === 'flatrate'` (ruleta, Brief, campana, cobertura).
 */
export function mapAndDeduplicateProviders(esProviders: any) {
    const mapProviders = (list: any[] | undefined, type: ProviderType) =>
        (list || []).map((provider: any) => ({
            provider_id: provider.provider_id,
            provider_name: provider.provider_name,
            logo_path: provider.logo_path,
            type,
        }));

    const flatrate = mapProviders(esProviders.flatrate, 'flatrate');
    const free = mapProviders(esProviders.free, 'free');
    const ads = mapProviders(esProviders.ads, 'ads');
    const rent = mapProviders(esProviders.rent, 'rent');
    const buy = mapProviders(esProviders.buy, 'buy');

    const combined = [...flatrate, ...free, ...ads, ...rent, ...buy];
    const uniqueById = new Map<number, { provider_id: number; provider_name: string; logo_path: string; type: ProviderType }>();

    // Si una plataforma ofrece el título de varias formas, manda la más barata para ti.
    const priority = { flatrate: 5, free: 4, ads: 3, rent: 2, buy: 1 } as const;
    for (const p of combined) {
        const existing = uniqueById.get(p.provider_id);
        if (!existing || priority[p.type] > priority[existing.type]) {
            uniqueById.set(p.provider_id, p);
        }
    }

    return Array.from(uniqueById.values());
}

/**
 * Obtener recomendaciones, similares, o combinación de ambas.
 * `mapItem` transforma cada resultado de la lista de TMDB al tipo esperado.
 *
 * C3 (2026-10-29): antes se pedía el DETALLE de las 20 primeras recomendaciones (20 llamadas por
 * ficha) solo para quitar las de la misma saga y mapear géneros. La lista ya trae todo lo que pinta
 * el carrusel, y la saga se quita con los ids de sus partes (`excludeIds`, que la ficha ya pide
 * para «Saga»: se pasa la promesa y las dos peticiones van en paralelo).
 */
export async function getRecommendationsOrSimilar<T extends { id: any; poster_path?: string }>(
    mediaType: MediaType,
    itemId: number,
    mapItem: (data: any) => T,
    excludeIds?: Promise<Set<number>> | Set<number> | null
): Promise<{
    success: boolean;
    recommendations: T[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    async function fetchAndMap(endpoint: 'recommendations' | 'similar', applyExclude: boolean): Promise<{
        success: boolean;
        items: T[];
        total_results?: number;
    }> {
        try {
            const data = await tmdbFetch<{ results: any[]; total_results: number }>(
                `/${mediaType}/${itemId}/${endpoint}`
            );

            const filtered = data.results.filter((item: any) => item.poster_path);

            let items: T[];
            if (applyExclude) {
                // Mismo recorte que cuando se pedían detalles: de las 20 primeras, fuera la saga, 12.
                const excluded = (await excludeIds) ?? new Set<number>();
                items = filtered.slice(0, 20).filter((item: any) => !excluded.has(item.id)).slice(0, 12).map(mapItem);
            } else {
                items = filtered.slice(0, 12).map(mapItem);
            }

            return { success: true, items, total_results: data.total_results };
        } catch (error) {
            console.error(`Error al obtener ${endpoint} de ${mediaType}/${itemId}:`, error);
            return { success: false, items: [] };
        }
    }

    // Intentar recomendaciones primero (quitando la propia saga)
    const recResult = await fetchAndMap('recommendations', true);

    // Si hay suficientes, devolver directamente
    if (recResult.success && recResult.items.length >= 6) {
        return { success: true, recommendations: recResult.items, type: 'recommendations' };
    }

    // Si no, intentar similares (como siempre, sin quitar la saga)
    const simResult = await fetchAndMap('similar', false);

    if (simResult.success) {
        if (recResult.success && recResult.items.length > 0) {
            // Combinar ambas fuentes, deduplicar por ID
            const combined = [...recResult.items, ...simResult.items];
            const seen = new Set<any>();
            const unique = combined.filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });

            return { success: true, recommendations: unique.slice(0, 12), type: 'combined' };
        }

        return { success: true, recommendations: simResult.items, type: 'similar' };
    }

    return {
        success: recResult.success,
        recommendations: recResult.items,
        type: 'recommendations',
        ...(recResult.success ? {} : { error: 'No se pudieron obtener recomendaciones ni similares' }),
    };
}

/**
 * Title art (3.3): logotipo oficial del título para el hero. Prefiere español,
 * luego inglés, luego neutro; dentro de cada idioma el de mayor vote_average.
 * Devuelve una URL w500 lista para <img>, o null (la ficha cae al título de texto).
 */
/** Logo del título: mejor votado en español, si no en inglés, si no sin idioma (URL w500). */
export function pickTitleLogo(logos: { file_path: string; iso_639_1: string | null; vote_average?: number }[] | undefined): string | null {
    if (!logos?.length) return null;
    const pick = (lang: string | null) =>
        logos.filter((l) => l.iso_639_1 === lang).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
    const best = pick('es') || pick('en') || pick(null) || logos[0];
    return best ? `https://image.tmdb.org/t/p/w500${best.file_path}` : null;
}

