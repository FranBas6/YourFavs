/**
 * GET /api/actor/[id]
 *
 * Ficha de ACTOR/PERSONA en JSON para la app móvil. Reúne el mismo dato TMDB
 * público que `pages/actor/[actor].astro` (servicios de `InfoActor.ts`), sin
 * duplicar lógica. Espejo de `/api/movie/[id]` y `/api/serie/[id]`.
 *
 * NO incluye estado personal (favoritos, seguir persona, avisos): la app lo lee
 * por las rutas con sesión. Público.
 *
 * Las producciones (cast: `movies`/`series`) van normalizadas con `toItem`
 * (mismo shape de card que summary/catalog) + `character` y `popularity`.
 * `crew` agrupa los trabajos relevantes (dirección/producción/guion).
 * Imágenes de galería (`images`) y `tagged` ya vienen como URL COMPLETA.
 */
import type { APIRoute } from 'astro';
import {
    getActorDetailsById,
    getMoviesAndSeriesByActorId,
    getActorCrewCredits,
    fetchActorImages,
    fetchTaggedImages,
} from '../../../services/API/Actors/InfoActor';
import { posterUrl } from '../../../services/API/shared/tmdbClient';
import { toItem } from '../summary';
import { safeFetch } from '../../../utils/safeFetch';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Normaliza un crédito de cast (peli/serie) al shape de card + personaje. */
function toCredit(raw: any, type: 'movie' | 'tv') {
    const base = toItem(raw, type);
    if (!base) return null;
    return {
        ...base,
        character: raw.character || null,
        popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    };
}

export const GET: APIRoute = async ({ params }) => {
    const id = params.id;
    if (!id) return json({ ok: false, error: 'Falta el id' }, 400);

    const [details, credits, crew, images, tagged] = await Promise.all([
        safeFetch(getActorDetailsById({ id }), `actor/${id}/details`, null as any),
        safeFetch(getMoviesAndSeriesByActorId({ id }), `actor/${id}/credits`, { movies: [], series: [] } as any),
        safeFetch(getActorCrewCredits({ id }), `actor/${id}/crew`, [] as any[]),
        safeFetch(fetchActorImages(id), `actor/${id}/images`, [] as any[]),
        safeFetch(fetchTaggedImages(id), `actor/${id}/tagged`, [] as any[]),
    ]);

    if (!details) return json({ ok: false, error: 'Actor no encontrado' }, 404);

    const movies = (credits.movies || [])
        .map((c: any) => toCredit(c, 'movie'))
        .filter(Boolean);
    const series = (credits.series || [])
        .map((c: any) => toCredit(c, 'tv'))
        .filter(Boolean);

    const crewCredits = (crew || []).map((c: any) => ({
        id: c.id,
        media_type: c.media_type,
        title: c.title,
        poster_path: c.poster_path,
        image: c.poster_path ? posterUrl(c.poster_path, 'w185') : null,
        job: c.job,
        year: c.year,
        vote_average: c.vote_average || 0,
    }));

    // Galería de perfiles (file_path ya es URL completa desde el servicio).
    const gallery = (images || []).slice(0, 25).map((img: any) => ({
        file_path: img.file_path,
        aspect_ratio: img.aspect_ratio,
        width: img.width,
        height: img.height,
    }));

    return json({
        ok: true,
        actor: {
            id: details.id,
            name: details.nombre,
            biography: details.biografia || null,
            place_of_birth: details.lugarNacimiento || null,
            birthday: details.fechaNacimiento || null,
            deathday: details.fechaFallecimiento || null,
            profile_path: details.imagen || null,
            image: details.imagen ? posterUrl(details.imagen, 'w185') : null,
            popularity: typeof details.popularidad === 'number' ? details.popularidad : null,
            known_for: details.conocidoPor || null,
            gender: details.genero ?? null,
            alias: details.alias || [],
            homepage: details.homepage || null,
            social: details.redes || {},
            movies,
            series,
            crew: crewCredits,
            images: gallery,
            tagged: tagged || [],
        },
    });
};
