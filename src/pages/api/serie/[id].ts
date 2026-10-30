/**
 * GET /api/serie/[id]
 *
 * Ficha de SERIE en JSON para la app móvil. Reúne el mismo dato TMDB público que
 * `pages/serie/[id].astro` (servicios de `InfoSeries.ts`), sin duplicar lógica.
 * Espejo de `/api/movie/[id]` con los campos propios de serie (temporadas,
 * número de temporadas/episodios, cadenas, creadores, próximo/último episodio).
 *
 * NO incluye estado personal (listas, rating, tags, episodios vistos, seguir,
 * notificaciones): la app lo lee directo de Firestore. Público.
 *
 * Las **temporadas** van con metadatos (sin la lista de episodios): los episodios
 * se piden aparte y en diferido con `GET /api/serie/[id]/season/[n]`.
 *
 * Imágenes: núcleo (`poster_path`, `backdrop_path`, `cast[].profile_path`,
 * `providers[].logo_path`, `seasons[].poster_path`) en RUTA CRUDA; `posters[]`,
 * `recommendations[]` y `title_logo` como URL COMPLETA.
 */
import type { APIRoute } from 'astro';
import {
    getSeriesBundle,
    getSerieRecommendationsOrSimilar,
    type SeriesBundle,
} from '../../../services/API/Series/InfoSeries';
import { safeFetch } from '../../../utils/safeFetch';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const GET: APIRoute = async ({ params }) => {
    const id = params.id;
    if (!id) return json({ ok: false, error: 'Falta el id' }, 400);

    // Bloque 1: la ficha en pocas llamadas a TMDB, temporadas incluidas (igual que la página, C2).
    const bundle = await safeFetch(getSeriesBundle(id), `serie/${id}/bundle`, null as SeriesBundle | null);
    const item = bundle?.item;
    if (!bundle || !item) return json({ ok: false, error: 'Serie no encontrada' }, 404);

    const tmdbId = item.id;
    const { cast, directors: crew, trailerUrl, externalIds, additionalInfo, videos, reviews: reviewsData, logo: titleLogo } = bundle;
    const posters = bundle.posters.slice(0, 40);

    // Bloque 2: recomendaciones (dependen de item).
    const recommendationsData = tmdbId
        ? await getSerieRecommendationsOrSimilar(tmdbId)
        : { success: false, recommendations: [], type: 'recommendations' as const };

    // Reseñas: top 5 con contenido (igual que la web).
    const reviews = (reviewsData.results || [])
        .filter((r: any) => r.content && r.content.length > 50)
        .slice(0, 5);

    // Temporadas CON episodios (de saque, como la web `allSeasonEpisodes`): así el
    // cliente muestra las stats por temporada (rating/duración medios, mejor, rango)
    // en la tarjeta colapsada, sin fetches extra. Se traen en paralelo.
    const rawSeasons = (item.seasons ?? []) as any[];
    const episodesBySeason = rawSeasons.map((s) => bundle.seasonEpisodes[s.season_number] || []);
    const seasons = rawSeasons.map((s: any, i: number) => ({
        id: s.id,
        season_number: s.season_number,
        name: s.name,
        overview: s.overview ?? null,
        air_date: s.air_date ?? null,
        episode_count: s.episode_count ?? 0,
        poster_path: s.poster_path ?? null, // crudo
        vote_average: s.vote_average ?? 0,
        episodes: (episodesBySeason[i] || []).map((e: any) => ({
            id: e.id,
            episode_number: e.episode_number,
            season_number: e.season_number,
            name: e.name ?? '',
            overview: e.overview ?? null,
            still_path: e.still_path ?? null, // crudo
            air_date: e.air_date ?? null,
            runtime: e.runtime ?? null,
            vote_average: e.vote_average ?? 0,
            guest_stars: (e.guest_stars ?? []).slice(0, 12).map((g: any) => ({
                id: g.id,
                name: g.name,
                character: g.character ?? '',
                profile_path: g.profile_path ?? null, // crudo
            })),
        })),
    }));

    const serie = {
        // ── Núcleo ──
        id: item.id,
        name: item.name,
        original_name: item.original_name,
        overview: item.overview,
        tagline: (additionalInfo as any).tagline ?? item.tagline ?? null,
        poster_path: item.poster_path ?? null,
        backdrop_path: item.backdrop_path ?? null,
        first_air_date: item.first_air_date ?? null,
        last_air_date: item.last_air_date ?? null,
        status: item.status ?? null,
        type: item.type ?? null, // Scripted, Miniseries, ...
        homepage: item.homepage ?? null,
        popularity: item.popularity ?? null,
        vote_average: item.vote_average ?? 0,
        vote_count: item.vote_count ?? 0,
        genres: item.genres ?? [],
        original_language: item.original_language ?? null,
        languages: item.languages ?? [],
        spoken_languages: item.spoken_languages ?? [],
        production_companies: item.production_companies ?? [],
        networks: item.networks ?? [],
        created_by: item.created_by ?? [], // [{ id, name, profile_path }]
        origin_country: item.origin_country ?? [],
        has_spanish_translation: (item as any).availableInSpain ?? false,

        // ── Temporadas / episodios ──
        number_of_seasons: item.number_of_seasons ?? seasons.filter((s: any) => s.season_number > 0).length,
        number_of_episodes: item.number_of_episodes ?? 0,
        episode_run_time: item.episode_run_time ?? [],
        seasons, // metadatos (episodios aparte)
        last_episode_to_air: item.last_episode_to_air ?? null,
        next_episode_to_air: item.next_episode_to_air ?? null,

        // ── IDs externos + redes ──
        imdb_id: externalIds.imdb_id ?? null,
        social: {
            facebook: externalIds.facebook_id ? `https://facebook.com/${externalIds.facebook_id}` : null,
            instagram: externalIds.instagram_id ? `https://instagram.com/${externalIds.instagram_id}` : null,
            twitter: externalIds.twitter_id ? `https://twitter.com/${externalIds.twitter_id}` : null,
        },

        // ── Dónde ver ──
        providers: (item as any).providers ?? [],
        providers_by_country: (item as any).providersByCountry ?? {},
        provider_links_by_country: (item as any).providerLinksByCountry ?? {},

        // ── Reparto y equipo ──
        cast,
        crew,

        // ── Multimedia ──
        trailer_url: trailerUrl,
        videos,
        posters,
        title_logo: titleLogo,

        // ── Relacionados ──
        recommendations: {
            type: recommendationsData.type,
            items: recommendationsData.recommendations ?? [],
        },

        // ── Extra ──
        keywords: (additionalInfo as any).keywords ?? [],
        content_ratings: (additionalInfo as any).content_ratings ?? [],
        reviews,
    };

    return json({ ok: true, serie }, 200);
};
