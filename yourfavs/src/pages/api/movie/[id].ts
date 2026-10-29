/**
 * GET /api/movie/[id]
 *
 * Ficha de película en JSON para la app móvil. Reúne EXACTAMENTE el mismo dato
 * TMDB público que la página `pages/movie/[id].astro` (mismos servicios de
 * `InfoMovies.ts` / `tmdbInfoService.ts`, sin duplicar lógica).
 *
 * NO incluye el estado personal (en qué listas está, rating, tags, veces vista,
 * notificaciones): la app lo lee DIRECTO de Firestore (arquitectura híbrida,
 * ver CLAUDE.md), no por aquí. Por eso el endpoint es público (no usa locals.user).
 *
 * Notas de imágenes (igual que la web): el núcleo (`poster_path`, `backdrop_path`,
 * `cast[].profile_path`, `providers[].logo_path`) va en RUTA CRUDA; `posters[]`,
 * `collection`, `recommendations[]` y `title_logo` ya vienen como URL COMPLETA
 * (así los devuelven sus servicios). La app construye tamaños con su helper.
 */
import type { APIRoute } from 'astro';
import {
    getMovieById,
    getMovieCast,
    getMovieDirectorsAndRoles,
    getMovieTrailer,
    fetchAllMoviePosters,
    getMovieCollectionInfo,
    getMovieRecommendationsOrSimilar,
    getMoviesAdditionalInfo,
    getMovieVideos,
} from '../../../services/API/Movies/InfoMovies';
import { getTitleLogo, getReviews } from '../../../services/API/shared/tmdbInfoService';
import { tmdbFetch } from '../../../services/API/shared/tmdbClient';
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

    // Bloque 1: básicos en paralelo (igual que la página).
    const [item, cast, crew, trailerUrl] = await Promise.all([
        safeFetch(getMovieById({ id }), `movie/${id}/details`, null as any),
        safeFetch(getMovieCast(id), `movie/${id}/cast`, [] as any[]),
        safeFetch(getMovieDirectorsAndRoles(id), `movie/${id}/directors`, [] as { name: string; job: string }[]),
        safeFetch(getMovieTrailer(id), `movie/${id}/trailer`, null),
    ]);

    if (!item) return json({ ok: false, error: 'Película no encontrada' }, 404);

    const tmdbId = item.id;

    // Bloque 2: dependen de item, no entre sí (igual que la página).
    const [
        posters,
        collection,
        recommendationsData,
        externalIds,
        additionalInfo,
        videos,
        reviewsData,
        titleLogo,
    ] = await Promise.all([
        fetchAllMoviePosters(id).then((p) => p.slice(0, 40)).catch(() => []),
        item.belongs_to_collection
            ? getMovieCollectionInfo(item.belongs_to_collection.id).catch(() => null)
            : Promise.resolve(null),
        tmdbId
            ? getMovieRecommendationsOrSimilar(tmdbId)
            : Promise.resolve({ success: false, recommendations: [], type: 'recommendations' as const }),
        tmdbId ? tmdbFetch<any>(`/movie/${tmdbId}/external_ids`).catch(() => ({})) : Promise.resolve({}),
        tmdbId
            ? getMoviesAdditionalInfo(tmdbId)
            : Promise.resolve({ keywords: [], languages: [], content_ratings: [], tagline: null, budget: null, revenue: null }),
        getMovieVideos(id).catch(() => []),
        tmdbId
            ? getReviews('movie', tmdbId)
            : Promise.resolve({ results: [] }),
        tmdbId ? getTitleLogo('movie', tmdbId) : Promise.resolve(null),
    ]);

    // Reseñas: top 5 con contenido (igual que la web).
    const reviews = (reviewsData.results || [])
        .filter((r: any) => r.content && r.content.length > 50)
        .slice(0, 5);

    const movie = {
        // ── Núcleo (TMDB crudo, rutas de imagen sin transformar) ──
        id: item.id,
        title: item.title,
        original_title: item.original_title,
        overview: item.overview,
        tagline: additionalInfo.tagline ?? item.tagline ?? null,
        poster_path: item.poster_path ?? null,
        backdrop_path: item.backdrop_path ?? null,
        release_date: item.release_date ?? null,
        runtime: item.runtime ?? null,
        status: item.status ?? null,
        homepage: item.homepage ?? null,
        adult: item.adult ?? false,
        popularity: item.popularity ?? null,
        vote_average: item.vote_average ?? 0,
        vote_count: item.vote_count ?? 0,
        genres: item.genres ?? [],
        original_language: item.original_language ?? null,
        spoken_languages: item.spoken_languages ?? [],
        production_countries: item.production_countries ?? [],
        production_companies: item.production_companies ?? [],
        budget: item.budget ?? null,
        revenue: item.revenue ?? null,
        belongs_to_collection: item.belongs_to_collection ?? null,
        has_spanish_translation: item.hasSpanishTranslation ?? false,

        // ── IDs externos + redes ──
        imdb_id: externalIds.imdb_id ?? null,
        social: {
            facebook: externalIds.facebook_id ? `https://facebook.com/${externalIds.facebook_id}` : null,
            instagram: externalIds.instagram_id ? `https://instagram.com/${externalIds.instagram_id}` : null,
            twitter: externalIds.twitter_id ? `https://twitter.com/${externalIds.twitter_id}` : null,
        },

        // ── Dónde ver (tu región) + por país ──
        providers: item.providers ?? [],
        providers_by_country: item.providersByCountry ?? {},
        provider_links_by_country: item.providerLinksByCountry ?? {},

        // ── Reparto y equipo ──
        cast, // [{ id, name, character, profile_path (crudo) }]
        crew, // [{ name, job }]

        // ── Multimedia ──
        trailer_url: trailerUrl,
        videos, // [{ key, name, type, site, ... }]
        posters, // [{ file_path (URL completa), aspect_ratio, iso_639_1, ... }]
        title_logo: titleLogo, // URL w500 | null

        // ── Relacionados ──
        collection, // saga { id, name, poster_path (URL), parts: [...] } | null
        recommendations: {
            type: recommendationsData.type,
            items: recommendationsData.recommendations ?? [],
        },

        // ── Extra (igual que la web) ──
        keywords: additionalInfo.keywords ?? [],
        languages: additionalInfo.languages ?? [],
        content_ratings: additionalInfo.content_ratings ?? [],
        reviews,
    };

    return json({ ok: true, movie }, 200);
};
