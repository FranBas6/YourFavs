/**
 * GET /api/calendar/u/{token}.ics — el calendario de una persona (Mensajes M5c; handoff M5 §3.8).
 *
 * La dirección es secreta y solo la conoce su dueño: quien la tenga ve sus estrenos y, con
 * «Incluir mis planes», sus planes (sin nota ni nombres). Las apps de calendario no mandan
 * cookies, así que no hace falta sesión. Una dirección cambiada o inventada → 404.
 */
import type { APIRoute } from 'astro';
import { icsOwner } from '../../../../services/BD/profile/icsToken';
import { userFeed } from '../../../../services/API/Calendar/icsFeed';
import { SOCIAL_PHASE } from '../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
    try {
        const owner = await icsOwner(String(params.token ?? ''));
        if (!owner) return new Response('Calendario no encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });
        const body = await userFeed(owner.userId, {
            plans: owner.plans && SOCIAL_PHASE.messages,
            baseUrl: `${url.protocol}//${url.host}`,
        });
        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="yourfavs.ics"',
                // Privado: ningún CDN lo guarda (al cambiar la dirección, la vieja deja de servir al momento).
                'Cache-Control': 'private, max-age=900',
            },
        });
    } catch (error) {
        console.error('Error generando ICS:', error);
        return new Response('Error generando calendario', { status: 500 });
    }
};
