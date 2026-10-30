/**
 * GET /api/calendar/subscribe.ics — la dirección antigua, la misma para todos.
 *
 * Desde M5c cada persona tiene la suya (`/api/calendar/u/{token}.ics`). Esta ya no saca nada
 * personal: un calendario con un solo evento que pide actualizar la suscripción (handoff M5 §3.8).
 * Como es igual para todos, se puede guardar en el CDN.
 */
import type { APIRoute } from 'astro';
import { legacyFeed } from '../../../services/API/Calendar/icsFeed';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    return new Response(legacyFeed(`${url.protocol}//${url.host}`), {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="yourfavs.ics"',
            'Cache-Control': 'public, max-age=3600',
        },
    });
};
