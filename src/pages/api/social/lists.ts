/**
 * GET /api/social/lists?tab=pendientes|amigos|siguiendo|seguidores|bloqueados&offset=0
 *   → { ok, items: PersonEntry[], total, hasMore, sent? }
 *
 * «Pendientes» trae las recibidas en `items` y las que enviaste en `sent` (F3), y las
 * recomendaciones recibidas y enviadas en `recsReceived` / `recsSent` (F4).
 *
 * Datos de cada pestaña del centro «Amigos», de 30 en 30. Son tuyas y de nadie más: el perfil
 * público no enseña a quién sigues ni quién te sigue (handoff §14, duda 3).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../lib/social/http';
import { listTab } from '../../../services/BD/social/graph';
import { listReceived, listSent } from '../../../services/BD/social/recommendations';
import { SOCIAL_PHASE } from '../../../utils/constants/social';
import type { FriendsTab } from '../../../lib/social/types';

export const prerender = false;

const TABS: FriendsTab[] = ['pendientes', 'amigos', 'siguiendo', 'seguidores', 'bloqueados'];

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    const tab = url.searchParams.get('tab') as FriendsTab;
    if (!TABS.includes(tab)) return badRequest();
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    try {
        const withRecs = tab === 'pendientes' && SOCIAL_PHASE.recommend;
        const [page, recsReceived, recsSent] = await Promise.all([
            listTab(me, tab, offset),
            withRecs ? listReceived(me) : Promise.resolve(undefined),
            withRecs ? listSent(me) : Promise.resolve(undefined),
        ]);
        return jsonNoStore({ ok: true, ...page, recsReceived, recsSent });
    } catch (err) {
        return serverError('api/social/lists', err);
    }
};
