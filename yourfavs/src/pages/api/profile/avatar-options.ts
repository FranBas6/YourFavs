/**
 * GET /api/profile/avatar-options — candidatos de avatar para el usuario.
 *
 * Reúne fotos de tus actores favoritos (vía /person/{id}/images). Las caras son
 * lo más apropiado para un avatar. Base TMDB → solo se guardará una URL (E.2/E.3).
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl } from '../../../services/API/shared/tmdbClient';
import { getActorsFav } from '../../../services/BD/actors/yourfavsActor';
import { processBatch } from '../../../utils/processBatch';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ options: [] }, 401);

    try {
        const actors = await getActorsFav();
        const top = actors.slice(0, 10);

        const perActor = await processBatch(
            top,
            async (a) => {
                const data = await tmdbFetch<{ profiles?: { file_path: string }[] }>(`/person/${a.id}/images`).catch(() => ({ profiles: [] }));
                return (data.profiles || []).slice(0, 2).map((img) => posterUrl(img.file_path, 'w342'));
            },
            5
        );

        const options = Array.from(new Set(perActor.flat().filter(Boolean))).slice(0, 24);
        return json({ options });
    } catch (err) {
        console.error('[api/profile/avatar-options] error:', (err as Error).message);
        return json({ options: [] });
    }
};
