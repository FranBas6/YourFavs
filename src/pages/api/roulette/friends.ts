/**
 * GET /api/roulette/friends — los amigos para los chips de la ruleta «¿Qué veo?» (F5 social):
 * con uno elegido, la ruleta propone lo que tenéis pendiente los dos.
 *
 * Solo amigos con perfil activo. El avatar va ya en HTML (`avatarHtml`) porque el script de la
 * ruleta es inline y no comparte módulos con el resto de la capa social.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { avatarHtml } from '../../../lib/social/ui';
import { rouletteFriends } from '../../../services/BD/social/inCommon';
import { SOCIAL_PHASE } from '../../../utils/constants/social';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const me = locals.user?.uid;
    if (!me || !SOCIAL_PHASE.friends) return jsonNoStore({ friends: [] });
    try {
        const people = await rouletteFriends(me);
        return jsonNoStore({
            friends: people.map((p) => ({
                id: p.id,
                name: p.name.split(/\s+/)[0] || p.name,
                avatar: avatarHtml(p, 22),
            })),
        });
    } catch (err) {
        console.error('[api/roulette/friends]', (err as Error).message);
        return jsonNoStore({ friends: [] }, 500);
    }
};
