/**
 * Estado de los avisos entre personas, calculado AL PINTAR (handoff social F2/F3 §5.3).
 *
 * El aviso guardado solo dice quién lo provocó (`actor_id`). Aquí se le añade la persona (nombre,
 * avatar) y la relación de ESTE momento, que decide qué se pinta: «Seguir también» o «Ahora sigues
 * a Ana». Así, si actuaste desde otro sitio, el aviso ya sale resuelto.
 *
 * Se caen los que ya no son verdad: un «te sigue» de alguien que dejó de seguirte, o cualquiera de
 * una persona bloqueada o cuya cuenta ya no existe.
 */
import type { NotificationDoc } from '../notifications/notifications';
import type { NotifView } from '../../../lib/social/types';
import { SOCIAL_NOTIF_TYPES } from '../../../lib/social/ui';
import { getPeople, getRelations } from './graph';

export async function withSocialState(me: string, docs: NotificationDoc[]): Promise<NotifView[]> {
    const actorIds = docs.filter((d) => SOCIAL_NOTIF_TYPES.has(d.type) && d.actor_id).map((d) => d.actor_id!);
    if (!actorIds.length) return docs.map(({ actor_id: _drop, ...d }) => d);
    const [people, rels] = await Promise.all([getPeople(actorIds), getRelations(me, actorIds)]);
    const out: NotifView[] = [];
    for (const { actor_id, ...d } of docs) {
        if (!SOCIAL_NOTIF_TYPES.has(d.type)) { out.push(d); continue; }
        const actor = actor_id ? people.get(actor_id) : undefined;
        const rel = actor_id ? rels.get(actor_id) : undefined;
        if (!actor || !rel || rel.blockedByMe) continue;
        if (d.type === 'follow' && !rel.followsMe) continue;
        out.push({ ...d, actor, rel });
    }
    return out;
}
