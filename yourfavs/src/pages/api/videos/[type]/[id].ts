import type { APIRoute } from 'astro';
import { tmdbFetch } from '../../../../services/API/shared/tmdbClient';

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

function pickBestTrailer(videos: VideoEntry[]): string | null {
    if (!videos || videos.length === 0) return null;
    const yt = videos.filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
    if (yt.length === 0) return null;

    const score = (v: VideoEntry) => {
        let s = 0;
        if (v.iso_639_1 === 'es') s += 100;
        else if (v.iso_639_1 === 'en') s += 50;
        if (v.type === 'Trailer') s += 30;
        if (v.official) s += 20;
        return s;
    };
    yt.sort((a, b) => score(b) - score(a));
    return yt[0].key;
}

export const GET: APIRoute = async ({ params }) => {
    const { type, id } = params;
    if (!type || !id || (type !== 'movie' && type !== 'tv')) {
        return new Response(JSON.stringify({ error: 'invalid' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const cacheKey = `${type}_${id}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        return new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
        });
    }

    try {
        const data = await tmdbFetch<{ results?: VideoEntry[] }>(`/${type}/${id}/videos`);
        const trailer = pickBestTrailer(data.results || []);
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
