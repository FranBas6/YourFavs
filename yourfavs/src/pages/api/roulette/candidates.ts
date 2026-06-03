import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../services/API/shared/tmdbClient';
import { mapAndDeduplicateProviders } from '../../../services/API/shared/tmdbInfoService';
import { getMoviesPendientes } from '../../../services/BD/movies/yourfavsMovie';
import { getSeriesPendientes } from '../../../services/BD/series/yourfavsSerie';
import { processBatch } from '../../../utils/processBatch';

export const prerender = false;

/**
 * Candidatos de la ruleta "¿Qué veo?": tus Pendientes enriquecidos con
 * runtime + proveedores ES (un fetch por item vía append_to_response).
 * El cliente filtra por tiempo/plataforma y elige aleatorio — este endpoint
 * solo precalcula y cachea. TTL corto: pendientes cambian a menudo.
 */
const TTL_MS = 30 * 60 * 1000;
const FALLBACK_EPISODE_RUNTIME = 45;
let memCache: { data: RoulettePayload; expires: number } | null = null;

interface RouletteCandidate {
    id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    year: string;
    vote_average: number | null;
    /** Minutos: duración de la peli o de un episodio (fallback 45). */
    runtime: number;
    genres: string[];
    /** Solo flatrate ES (suscripción): para el filtro "dónde puedo verlo". */
    providers: { id: number; name: string; logo: string | null }[];
    /** Página JustWatch del título en ES (todos sus proveedores). */
    provider_link: string | null;
}

interface RoulettePayload {
    candidates: RouletteCandidate[];
}

async function enrich(id: string, type: 'movie' | 'tv'): Promise<RouletteCandidate | null> {
    try {
        const detail = await tmdbFetch<any>(`/${type}/${id}`, { append_to_response: 'watch/providers' });
        const rawES = detail['watch/providers']?.results?.ES || {};
        const runtime = type === 'movie'
            ? (detail.runtime || 0)
            : (detail.episode_run_time?.[0] || detail.last_episode_to_air?.runtime || FALLBACK_EPISODE_RUNTIME);
        return {
            id: String(id),
            media_type: type,
            title: type === 'movie' ? detail.title : detail.name,
            poster_path: detail.poster_path ?? null,
            year: String(type === 'movie' ? detail.release_date || '' : detail.first_air_date || '').slice(0, 4),
            vote_average: typeof detail.vote_average === 'number' && detail.vote_average > 0 ? detail.vote_average : null,
            runtime: runtime || FALLBACK_EPISODE_RUNTIME,
            genres: (detail.genres || []).slice(0, 3).map((g: any) => g.name),
            providers: mapAndDeduplicateProviders(rawES)
                .filter((p) => p.type === 'flatrate')
                .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null })),
            provider_link: rawES.link ?? null,
        };
    } catch {
        return null; // un candidato caído no tumba la ruleta
    }
}

export const GET: APIRoute = async () => {
    const now = Date.now();
    if (memCache && memCache.expires > now) return json(memCache.data, 200, true);

    try {
        const [movies, series] = await Promise.all([getMoviesPendientes(), getSeriesPendientes()]);
        const jobs = [
            ...movies.map((m: any) => ({ id: String(m.id), type: 'movie' as const })),
            ...series.map((s: any) => ({ id: String(s.id), type: 'tv' as const })),
        ];
        const enriched = await processBatch(jobs, (j) => enrich(j.id, j.type), 8);
        const payload: RoulettePayload = {
            candidates: enriched.filter((c): c is RouletteCandidate => c !== null && !!c.title),
        };
        memCache = { data: payload, expires: now + TTL_MS };
        return json(payload, 200, true);
    } catch (err) {
        console.error('[api/roulette] error:', (err as Error).message);
        return json({ candidates: [] } satisfies RoulettePayload, 200); // sin cachear el fallo
    }
};

function json(data: unknown, status: number, cacheable = false): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...(cacheable ? { 'Cache-Control': 'public, max-age=1800' } : {}),
        },
    });
}
