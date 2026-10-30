/**
 * GET /api/serie/[id]/season/[season]
 *
 * Episodios de una temporada (carga diferida: la app los pide al desplegar la
 * temporada, no en la ficha inicial). Reusa `getEpisodesBySeasonNumber`.
 * Público. `still_path` va en RUTA CRUDA.
 */
import type { APIRoute } from 'astro';
import { getEpisodesBySeasonNumber } from '../../../../../services/API/Series/InfoSeries';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const GET: APIRoute = async ({ params }) => {
    const id = params.id;
    const season = Number(params.season);
    if (!id || !Number.isFinite(season)) {
        return json({ ok: false, error: 'Parámetros inválidos' }, 400);
    }

    try {
        const raw = await getEpisodesBySeasonNumber(id, season);
        const episodes = raw.map((e: any) => ({
            id: e.id,
            episode_number: e.episode_number,
            season_number: e.season_number,
            name: e.name ?? '',
            overview: e.overview ?? null,
            still_path: e.still_path ?? null, // crudo
            air_date: e.air_date ?? null,
            runtime: e.runtime ?? null,
            vote_average: e.vote_average ?? 0,
        }));
        return json({ ok: true, episodes }, 200);
    } catch (err) {
        console.error('[api/serie/season GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudieron cargar los episodios.' }, 500);
    }
};
