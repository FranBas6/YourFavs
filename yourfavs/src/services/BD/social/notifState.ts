/**
 * Estado de los avisos entre personas, calculado AL PINTAR (handoff social F2/F3 §5.3).
 *
 * El aviso guardado solo dice quién lo provocó (`actor_id`). Aquí se le añade la persona (nombre,
 * avatar) y la relación de ESTE momento, que decide qué se pinta: «Seguir también» o «Ahora sigues
 * a Ana»; «Aceptar / Rechazar», «Ahora sois amigos», «Solicitud rechazada.» o «ya no está
 * pendiente» (F3, mirando la solicitud por su id: `freq:{id}`). Así, si actuaste desde otro sitio,
 * el aviso ya sale resuelto.
 *
 * Se caen los que ya no son verdad: un «te sigue» de alguien que dejó de seguirte, o cualquiera de
 * una persona bloqueada o cuya cuenta ya no existe.
 */
import type { NotificationDoc } from '../notifications/notifications';
import type { NotifView } from '../../../lib/social/types';
import { SOCIAL_NOTIF_TYPES } from '../../../lib/social/ui';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getPeople, getRelations } from './graph';

/** Estado de las solicitudes recibidas por `me` con esos ids. Las que no estén: «gone». */
async function requestStates(me: string, ids: number[]): Promise<Map<number, NotifView['req']>> {
    if (!ids.length) return new Map();
    const { data, error } = await supabaseAdmin().from('friend_requests').select('id, status').eq('to_id', me).in('id', ids);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [r.id, r.status === 'cancelled' ? 'gone' : (r.status as NotifView['req'])]));
}

export async function withSocialState(me: string, docs: NotificationDoc[]): Promise<NotifView[]> {
    const actorIds = docs.filter((d) => SOCIAL_NOTIF_TYPES.has(d.type) && d.actor_id).map((d) => d.actor_id!);
    if (!actorIds.length) return docs.map(({ actor_id: _drop, ...d }) => d);
    const reqIds = docs.filter((d) => d.type === 'friend_request').map((d) => Number(d.id.split(':')[1])).filter(Number.isFinite);
    const [people, rels, reqs] = await Promise.all([getPeople(actorIds), getRelations(me, actorIds), requestStates(me, reqIds)]);
    const out: NotifView[] = [];
    for (const { actor_id, ...d } of docs) {
        if (!SOCIAL_NOTIF_TYPES.has(d.type)) { out.push(d); continue; }
        const actor = actor_id ? people.get(actor_id) : undefined;
        const rel = actor_id ? rels.get(actor_id) : undefined;
        if (!actor || !rel || rel.blockedByMe) continue;
        if (d.type === 'follow' && !rel.followsMe) continue;
        const req = d.type === 'friend_request' ? reqs.get(Number(d.id.split(':')[1])) ?? 'gone' : undefined;
        out.push({ ...d, actor, rel, ...(req ? { req } : {}) });
    }
    return out;
}
