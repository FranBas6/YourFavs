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
    getMovieBundle,
    getMovieCollectionInfo,
    getMovieRecommendationsOrSimilar,
    type MovieBundle,
} from '../../../services/API/Movies/InfoMovies';
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

    // Bloque 1: la ficha en UNA llamada a TMDB (igual que la página, C1).
    const bundle = await safeFetch(getMovieBundle(id), `movie/${id}/bundle`, null as MovieBundle | null);
    const item = bundle?.item;
    if (!bundle || !item) return json({ ok: false, error: 'Película no encontrada' }, 404);

    const tmdbId = item.id;
    const { cast, directors: crew, trailerUrl, externalIds, additionalInfo, videos, reviews: reviewsData, logo: titleLogo } = bundle;
    const posters = bundle.posters.slice(0, 40);

    // Bloque 2: saga y recomendaciones, en paralelo; las recomendaciones quitan la saga con sus ids (C3).
    const collectionPromise = item.belongs_to_collection
        ? getMovieCollectionInfo(item.belongs_to_collection.id).catch(() => null)
        : Promise.resolve(null);
    const [collection, recommendationsData] = await Promise.all([
        collectionPromise,
        tmdbId
            ? getMovieRecommendationsOrSimilar(tmdbId, item.belongs_to_collection ? collectionPromise.then((c) => c?.parts?.map((p) => p.id)) : null)
            : Promise.resolve({ success: false, recommendations: [], type: 'recommendations' as const }),
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
