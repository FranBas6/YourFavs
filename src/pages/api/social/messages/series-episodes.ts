/**
 * GET /api/social/messages/series-episodes?id= → { ok, seasons: { [n]: episodios }, last: { season, episode } | null }
 *
 * Para elegir temporada y episodio de un spoiler (M4c, handoff M4 §3.3): los episodios de cada
 * temporada (TMDB) y el último que has visto tú, para dejar marcado el siguiente.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../lib/social/http';
import { seriesEpisodes } from '../../../../services/BD/social/chatCards';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const id = posInt(url.searchParams.get('id'));
    if (!id) return badRequest();
    try {
        return jsonNoStore({ ok: true, ...(await seriesEpisodes(me, id)) });
    } catch (err) {
        return serverError('api/social/messages/series-episodes GET', err);
    }
};
