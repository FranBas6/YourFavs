import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../../services/API/shared/tmdbClient';
import { pickBestTrailerKey, videoLanguages } from '../../../../services/API/shared/tmdbInfoService';
import { getCurrentLanguage } from '../../../../services/BD/shared/userScope';

export const prerender = false;

interface VideoEntry {
    site: string;
    type: string;
    key: string;
    iso_639_1?: string;
    name?: string;
    official?: boolean;
}

const cache = new Map<string, { data: { trailer: string | null }; expires: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = async ({ params }) => {
    const { type, id } = params;
    if (!type || !id || (type !== 'movie' && type !== 'tv')) {
        return new Response(JSON.stringify({ error: 'invalid' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // El idioma va en la clave: el tráiler elegido depende del idioma del perfil.
    const cacheKey = `${type}_${id}_${getCurrentLanguage()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        return new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
        });
    }

    try {
        const data = await tmdbFetch<{ results?: VideoEntry[] }>(`/${type}/${id}/videos`, { include_video_language: videoLanguages() });
        const trailer = pickBestTrailerKey(data.results || []);
        const payload = { trailer };
        cache.set(cacheKey, { data: payload, expires: Date.now() + TTL_MS });
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
        });
    } catch (error) {
        console.error('Error /api/videos:', error);
        return new Response(JSON.stringify({ trailer: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
