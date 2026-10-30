/**
 * GET /api/social/messages/plans?ids=1,2,3 → { ok, plans: PlanView[] }
 *
 * Las tarjetas de plan de una conversación abierta, otra vez resueltas para quien pide (M5): las
 * respuestas no escriben en el chat, así que el chat las vuelve a pedir al recibir un aviso.
 * Solo vienen los planes que puedes ver. Como mucho 30.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../../../lib/http';
import { badRequest, posInt, serverError, unauthorized } from '../../../../../lib/social/http';
import { planViews } from '../../../../../services/BD/social/chatCards';
import { SOCIAL_PHASE } from '../../../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const me = locals.user?.uid;
    if (!me) return unauthorized();
    if (!SOCIAL_PHASE.messages) return badRequest('disabled');
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(posInt).filter((n): n is number => n !== null).slice(0, 30);
    if (!ids.length) return badRequest();
    try {
        return jsonNoStore({ ok: true, plans: [...(await planViews(me, ids)).values()] });
    } catch (err) {
        return serverError('api/social/messages/plans GET', err);
    }
};
