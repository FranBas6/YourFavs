/**
 * GET /api/serie/[id]/providers?season=N
 *
 * "Dónde ver" de UNA temporada (carga diferida: la ficha trae solo la temporada que estás
 * viendo y el resto se piden al pulsar su chip). El endpoint de título devuelve la unión de
 * todas las temporadas, que es justo lo que hacía mentir al bloque.
 * Público, igual que el resto de datos de TMDB. Los `logo_path` van en RUTA CRUDA.
 */
import type { APIRoute } from 'astro';
import { getSeasonWatchProviders } from '../../../../services/API/Series/InfoSeries';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // Los catálogos cambian de mes en mes, no de minuto en minuto.
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

export const GET: APIRoute = async ({ params, url }) => {
    const id = params.id;
    // Ojo: la temporada 0 es válida (los especiales), así que hay que distinguir "0" de
    // "no viene" — `Number(null)` es 0 y colaría como especiales sin haberlo pedido.
    const raw = url.searchParams.get('season');
    const season = Number(raw);
    if (!id || raw === null || raw.trim() === '' || !Number.isInteger(season) || season < 0) {
        return json({ ok: false, error: 'Parámetros inválidos' }, 400);
    }

    try {
        const { providersByCountry, linkByCountry } = await getSeasonWatchProviders(id, season);
        return json({ ok: true, season, providersByCountry, linkByCountry }, 200);
    } catch (err) {
        console.error('[api/serie/providers GET] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo cargar la disponibilidad.' }, 500);
    }
};
