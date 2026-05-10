import type { APIRoute } from 'astro';
import { getContinueWatchingData } from '../../services/API/Series/continueWatching';
import { getForYouRecommendations } from '../../services/API/shared/forYouRecommendations';
import { safeFetch } from '../../utils/safeFetch';

export const GET: APIRoute = async () => {
    const [continueWatching, forYou] = await Promise.all([
        safeFetch(getContinueWatchingData(), 'api/home-deferred/continueWatching', [] as any[]),
        safeFetch(getForYouRecommendations(), 'api/home-deferred/forYou', [] as any[]),
    ]);

    return new Response(JSON.stringify({ continueWatching, forYou }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            // Cache breve compartida en CDN: si dos visitantes entran seguidos
            // el segundo no paga el coste TMDB. 'private' porque depende de la BD del usuario.
            'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
        },
    });
};
