/**
 * GET /api/profile/avatar-options — candidatos de avatar para el usuario.
 *
 * Dos fuentes (TMDB): caras de tus actores favoritos (vía /person/{id}/images)
 * y pósters de tus pelis/series guardadas. El front las muestra en dos grupos.
 * Base TMDB → solo se guardará una URL (E.2/E.3). Para subir una foto propia,
 * ver /api/profile/avatar-upload.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, posterUrl } from '../../../services/API/shared/tmdbClient';
import { getActorsFav } from '../../../services/BD/actors/yourfavsActor';
import { getMovieFav } from '../../../services/BD/movies/yourfavsMovie';
import { getSerieFav } from '../../../services/BD/series/yourfavsSerie';
import { processBatch } from '../../../utils/processBatch';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ actors: [], posters: [], options: [] }, 401);

    try {
        const [actorsFav, movies, series] = await Promise.all([
            getActorsFav().catch(() => []),
            getMovieFav().catch(() => []),
            getSerieFav().catch(() => []),
        ]);

        // Caras de actores: hasta 2 imágenes por actor (top 10 favoritos).
        const perActor = await processBatch(
            actorsFav.slice(0, 10),
            async (a) => {
                const data = await tmdbFetch<{ profiles?: { file_path: string }[] }>(`/person/${a.id}/images`).catch(() => ({ profiles: [] }));
                return (data.profiles || []).slice(0, 2).map((img) => posterUrl(img.file_path, 'w342'));
            },
            5
        );
        const actors = Array.from(new Set(perActor.flat().filter(Boolean))).slice(0, 24);

        // Pósters de tus listas (poster_path ya viene en las colecciones).
        const posterPaths = [...movies, ...series]
            .map((m) => (m as { poster_path?: string }).poster_path)
            .filter((p): p is string => Boolean(p));
        const posters = Array.from(new Set(posterPaths.map((p) => posterUrl(p, 'w342')).filter(Boolean))).slice(0, 24);

        // `options`: lista combinada (compat con el grid plano actual del modal).
        const options = Array.from(new Set([...actors, ...posters]));
        return json({ actors, posters, options });
    } catch (err) {
        console.error('[api/profile/avatar-options] error:', (err as Error).message);
        return json({ actors: [], posters: [], options: [] });
    }
};
