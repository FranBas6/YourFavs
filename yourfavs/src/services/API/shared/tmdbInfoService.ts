import { tmdbFetch, type MediaType } from './tmdbClient';

/**
 * Obtener el trailer (YouTube) de una película o serie
 */
export async function getTrailer(mediaType: MediaType, id: string): Promise<string | null> {
    try {
        const data = await tmdbFetch<{ results: any[] }>(`/${mediaType}/${id}/videos`);
        const trailer = data.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (error) {
        console.error(`Error al obtener el trailer de ${mediaType}/${id}:`, error);
        return null;
    }
}

/**
 * Obtener todos los videos de una película o serie
 */
export async function getVideos(mediaType: MediaType, id: string): Promise<any[]> {
    try {
        const data = await tmdbFetch<{ results: any[] }>(`/${mediaType}/${id}/videos`);
        return data.results || [];
    } catch (error) {
        console.error(`Error al obtener los videos de ${mediaType}/${id}:`, error);
        return [];
    }
}

/**
 * Obtener directores y roles relevantes del equipo
 */
export async function getDirectorsAndRoles(
    mediaType: MediaType,
    id: string,
    relevantRoles: string[]
): Promise<{ name: string; job: string }[]> {
    try {
        const data = await tmdbFetch<{ crew: any[] }>(`/${mediaType}/${id}/credits`);

        if (!data.crew) {
            console.error(`No se encontró información del equipo para ${mediaType}/${id}`);
            return [];
        }

        return data.crew
            .filter((member: any) => relevantRoles.includes(member.job))
            .map((person: any) => ({ name: person.name, job: person.job }));
    } catch (error) {
        console.error(`Error al obtener directores y roles de ${mediaType}/${id}:`, error);
        return [];
    }
}

/**
 * Obtener información adicional (keywords, networks, content_ratings, etc.)
 */
export async function getAdditionalInfo(
    mediaType: MediaType,
    id: string
): Promise<Record<string, any>> {
    try {
        const [keywordsData, detailData] = await Promise.all([
            tmdbFetch<{ results?: any[] }>(`/${mediaType}/${id}/keywords`),
            tmdbFetch<any>(`/${mediaType}/${id}`, { append_to_response: 'content_ratings' }),
        ]);

        const base: Record<string, any> = {
            keywords: keywordsData.results || [],
            networks: detailData.networks || [],
            content_ratings: detailData.content_ratings?.results || [],
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
    } catch (error) {
        console.error(`Error al obtener información adicional de ${mediaType}/${id}:`, error);
        return {
            keywords: [],
            networks: [],
            content_ratings: [],
            episode_run_time: [],
            languages: [],
            tagline: null,
            ...(mediaType === 'movie' ? { budget: null, revenue: null } : {}),
        };
    }
}

/**
 * Mapear y deduplicar proveedores de streaming (flatrate > rent > buy)
 */
export function mapAndDeduplicateProviders(esProviders: any) {
    const mapProviders = (list: any[] | undefined, type: 'flatrate' | 'rent' | 'buy') =>
        (list || []).map((provider: any) => ({
            provider_id: provider.provider_id,
            provider_name: provider.provider_name,
            logo_path: provider.logo_path,
            type,
        }));

    const flatrate = mapProviders(esProviders.flatrate, 'flatrate');
    const rent = mapProviders(esProviders.rent, 'rent');
    const buy = mapProviders(esProviders.buy, 'buy');

    const combined = [...flatrate, ...rent, ...buy];
    const uniqueById = new Map<number, { provider_id: number; provider_name: string; logo_path: string; type: 'flatrate' | 'rent' | 'buy' }>();

    const priority = { flatrate: 3, rent: 2, buy: 1 } as const;
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
 * mapDetailToItem transforma la respuesta detallada de TMDB al tipo esperado.
 */
export async function getRecommendationsOrSimilar<T extends { id: any; poster_path?: string }>(
    mediaType: MediaType,
    itemId: number,
    mapDetailToItem: (data: any) => T,
    shouldExclude?: (data: any) => boolean
): Promise<{
    success: boolean;
    recommendations: T[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    async function fetchAndMap(endpoint: 'recommendations' | 'similar', fetchDetails: boolean): Promise<{
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
            if (fetchDetails) {
                const detailedPromises = filtered.slice(0, 20).map(async (item: any) => {
                    try {
                        const detail = await tmdbFetch<any>(`/${mediaType}/${item.id}`);
                        if (shouldExclude && shouldExclude(detail)) return null;
                        return mapDetailToItem(detail);
                    } catch {
                        return null;
                    }
                });
                items = (await Promise.all(detailedPromises)).filter(Boolean).slice(0, 12) as T[];
            } else {
                items = filtered.slice(0, 12).map(mapDetailToItem);
            }

            return { success: true, items, total_results: data.total_results };
        } catch (error) {
            console.error(`Error al obtener ${endpoint} de ${mediaType}/${itemId}:`, error);
            return { success: false, items: [] };
        }
    }

    // Intentar recomendaciones primero (con fetch de detalles)
    const recResult = await fetchAndMap('recommendations', true);

    // Si hay suficientes, devolver directamente
    if (recResult.success && recResult.items.length >= 6) {
        return { success: true, recommendations: recResult.items, type: 'recommendations' };
    }

    // Si no, intentar similares (sin fetch de detalles, más rápido)
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
