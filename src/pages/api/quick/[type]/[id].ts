/**
 * GET /api/quick/{movie|tv}/{id} — datos de la VISTA RÁPIDA de una tarjeta (rediseño, paso 3.7;
 * docs/design_handoff_rediseno, README «Encargo E»).
 *
 * Solo lo que pinta el panel, en UNA llamada a TMDB (`append_to_response=videos,watch/providers`):
 *   - meta: año, duración o nº de temporadas, géneros, sinopsis, fondo y nota;
 *   - tráiler (la misma elección que /api/videos: idioma del perfil > inglés > cualquiera);
 *   - dónde verla: UNA plataforma, la tuya primero (si no, la primera de suscripción del país);
 *   - con sesión: en qué listas está y, en series que sigues, progreso y próximo episodio
 *     (respetando el modo sin spoilers: sin título si toca ocultarlo).
 * Privado (depende de tu sesión): sin caché compartida.
 */
import type { APIRoute } from 'astro';
import { tmdbFetch, backdropUrl, IMAGE_BASE } from '../../../../services/API/shared/tmdbClient';
import { pickBestTrailerKey, videoLanguages, mapAndDeduplicateProviders } from '../../../../services/API/shared/tmdbInfoService';
import { getCurrentRegion } from '../../../../services/BD/shared/userScope';
import { checkMediaExistence } from '../../../../services/BD/shared/checkExistence';
import { getNextEpisode } from '../../../../services/API/Series/nextEpisode';

export const prerender = false;

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

const TYPE_LABEL: Record<string, string> = { flatrate: 'suscripción', free: 'gratis', ads: 'con anuncios', rent: 'alquiler', buy: 'compra' };

export const GET: APIRoute = async ({ params, locals }) => {
    const type = params.type;
    const id = String(params.id || '');
    if ((type !== 'movie' && type !== 'tv') || !/^\d+$/.test(id)) return json({ ok: false, error: 'invalid' }, 400);

    const region = getCurrentRegion();
    const user = locals.user ?? null;

    let d: any;
    try {
        d = await tmdbFetch<any>(`/${type}/${id}`, {
            append_to_response: 'videos,watch/providers',
            include_video_language: videoLanguages(),
        });
    } catch (err) {
        console.error('[api/quick] TMDB:', (err as Error).message);
        return json({ ok: false, error: 'tmdb' }, 502);
    }

    // ---- Meta ----
    const isTv = type === 'tv';
    const date: string = (isTv ? d.first_air_date : d.release_date) || '';
    const regularSeasons = isTv ? (d.seasons || []).filter((s: any) => s.season_number > 0).length : 0;
    const endYear = isTv && (d.status === 'Ended' || d.status === 'Canceled') && d.last_air_date ? d.last_air_date.slice(0, 4) : null;
    const years = isTv
        ? (date ? (endYear && endYear !== date.slice(0, 4) ? `${date.slice(0, 4)}–${endYear}` : endYear ? date.slice(0, 4) : `${date.slice(0, 4)}–hoy`) : '')
        : date.slice(0, 4);
    const runtime: number | null = isTv ? null : (d.runtime || null);
    const duration = runtime ? (runtime >= 60 ? `${Math.floor(runtime / 60)} h ${runtime % 60} min` : `${runtime} min`) : null;
    const seasonsLabel = isTv && regularSeasons ? `${regularSeasons} ${regularSeasons === 1 ? 'temporada' : 'temporadas'}` : null;
    const genres: string[] = (d.genres || []).slice(0, 2).map((g: any) => g.name);

    // ---- Dónde verla: una plataforma, la tuya primero ----
    const regionData = d['watch/providers']?.results?.[region] || null;
    let provider: any = null;
    if (regionData) {
        const list = mapAndDeduplicateProviders(regionData);
        const mine = new Set(user?.platforms ?? []);
        const pick = list.find((p) => mine.has(p.provider_id)) || list.find((p) => p.type === 'flatrate') || list[0];
        if (pick) provider = {
            name: pick.provider_name,
            logo: pick.logo_path ? `${IMAGE_BASE}/w92${pick.logo_path}` : null,
            mine: mine.has(pick.provider_id),
            kind: TYPE_LABEL[pick.type] ?? '',
            link: regionData.link || null,
        };
    }

    // ---- Tu estado (solo con sesión) ----
    let state: Record<string, boolean> | null = null;
    let progress: { watched: number; total: number } | null = null;
    let next: { season: number; episode: number; name: string | null; airDate: string | null } | null = null;
    if (user) {
        const ex = await (isTv ? checkMediaExistence('serie', id) : checkMediaExistence('movie', id)).catch(() => null);
        if (ex) {
            const e = ex.exists as Record<string, boolean>;
            state = isTv
                ? { pendiente: !!e.SeriesPendiente, visto: !!(e.SeriesVistas || e.LikedSeries || e.SeriesFavs), siguiendo: !!e.SeriesSiguiendo, abandonada: !!e.SeriesAbandonadas }
                : { pendiente: !!e.MoviesPendientes, visto: !!(e.MoviesVistas || e.LikedMovies || e.MovieFavs), viendo: !!e.MoviesViendo };
        }
        if (isTv && state?.siguiendo) {
            const ne = await getNextEpisode(id).catch(() => null);
            if (ne) {
                progress = { watched: ne.watched_count, total: ne.total_count };
                const hideTitle = !!(user.spoilers?.enabled && user.spoilers?.hideSynopsis);
                next = { season: ne.next_season, episode: ne.next_episode, name: hideTitle ? null : (ne.next_episode_name || null), airDate: ne.air_date };
            }
        }
    }

    return json({
        ok: true,
        type, id,
        title: isTv ? d.name : d.title,
        years, duration, seasonsLabel, genres,
        overview: d.overview || '',
        vote: typeof d.vote_average === 'number' && d.vote_average > 0 ? Number(d.vote_average.toFixed(1)) : null,
        backdrop: d.backdrop_path ? backdropUrl(d.backdrop_path) : null,
        trailer: pickBestTrailerKey(d.videos?.results || []),
        provider,
        loggedIn: !!user,
        state, progress, next,
    });
};
