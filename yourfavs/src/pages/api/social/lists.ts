/**
 * GET /api/social/lists?tab=pendientes|amigos|siguiendo|seguidores|bloqueados&offset=0
 *   → { ok, items: PersonEntry[], total, hasMore, sent? }
 *
 * «Pendientes» trae las recibidas en `items` y las que enviaste en `sent` (F3).
 *
 * Datos de cada pestaña del centro «Amigos», de 30 en 30. Son tuyas y de nadie más: el perfil
 * público no enseña a quién sigues ni quién te sigue (handoff §14, duda 3).
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { badRequest, serverError, unauthorized } from '../../../lib/social/http';
import { listTab } from '../../../services/BD/social/graph';
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
        return jsonNoStore({ ok: true, ...(await listTab(me, tab, offset)) });
    } catch (err) {
        return serverError('api/social/lists', err);
    }
};
