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
import type { NotifView, RecView } from '../../../lib/social/types';
import { SOCIAL_NOTIF_TYPES } from '../../../lib/social/ui';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getPeople, getRelations } from './graph';
import { recViewsForNotifs } from './recommendations';

/** Id de la recomendación de un aviso: `rec:{id}`, `recrep:{id}:{uid}` o `recseen:{id}:{uid}`. */
const recIdOf = (notifId: string) => Number(notifId.split(':')[1]);

/** Estado de las solicitudes recibidas por `me` con esos ids. Las que no estén: «gone». */
async function requestStates(me: string, ids: number[]): Promise<Map<number, NotifView['req']>> {
    if (!ids.length) return new Map();
    const { data, error } = await supabaseAdmin().from('friend_requests').select('id, status').eq('to_id', me).in('id', ids);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [r.id, r.status === 'cancelled' ? 'gone' : (r.status as NotifView['req'])]));
}

/**
 * «Ana ha visto Dune (★ 8)»: la nota de quien la vio, leída al pintar (si la pone o la cambia
 * después, el aviso ya sale con la buena). Clave `{persona}:{tipo}:{id}`.
 */
async function watchedScores(docs: NotificationDoc[], sent: Map<number, RecView>): Promise<Map<string, number>> {
    const pairs = docs
        .map((d) => ({ who: d.actor_id, rec: sent.get(recIdOf(d.id)) }))
        .filter((p): p is { who: string; rec: RecView } => Boolean(p.who && p.rec && (p.rec.targetType === 'movie' || p.rec.targetType === 'tv')));
    if (!pairs.length) return new Map();
    const { data, error } = await supabaseAdmin().from('ratings').select('user_id, media_type, tmdb_id, score')
        .in('user_id', [...new Set(pairs.map((p) => p.who))])
        .in('tmdb_id', [...new Set(pairs.map((p) => p.rec.targetId))]);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [`${r.user_id}:${r.media_type}:${r.tmdb_id}`, Number(r.score)]));
}

export async function withSocialState(me: string, docs: NotificationDoc[]): Promise<NotifView[]> {
    const actorIds = docs.filter((d) => SOCIAL_NOTIF_TYPES.has(d.type) && d.actor_id).map((d) => d.actor_id!);
    if (!actorIds.length) return docs.map(({ actor_id: _drop, ...d }) => d);
    const reqIds = docs.filter((d) => d.type === 'friend_request').map((d) => Number(d.id.split(':')[1])).filter(Number.isFinite);
    const recvIds = docs.filter((d) => d.type === 'recommendation').map((d) => recIdOf(d.id)).filter(Number.isFinite);
    const sentIds = docs.filter((d) => d.type === 'rec_reply' || d.type === 'rec_watched').map((d) => recIdOf(d.id)).filter(Number.isFinite);
    const [people, rels, reqs, recs] = await Promise.all([
        getPeople(actorIds), getRelations(me, actorIds), requestStates(me, reqIds), recViewsForNotifs(me, recvIds, sentIds),
    ]);
    const scores = await watchedScores(docs.filter((d) => d.type === 'rec_watched'), recs.sent);
    const out: NotifView[] = [];
    for (const { actor_id, ...d } of docs) {
        if (!SOCIAL_NOTIF_TYPES.has(d.type)) { out.push(d); continue; }
        const actor = actor_id ? people.get(actor_id) : undefined;
        const rel = actor_id ? rels.get(actor_id) : undefined;
        if (!actor || !rel || rel.blockedByMe) continue;
        if (d.type === 'follow' && !rel.followsMe) continue;
        const req = d.type === 'friend_request' ? reqs.get(Number(d.id.split(':')[1])) ?? 'gone' : undefined;
        // Recomendaciones (F4): sin la recomendación (retirada) el aviso no se pinta.
        const rec = d.type === 'recommendation' ? recs.received.get(recIdOf(d.id))
            : d.type === 'rec_reply' || d.type === 'rec_watched' ? recs.sent.get(recIdOf(d.id)) : undefined;
        if ((d.type === 'recommendation' || d.type === 'rec_reply' || d.type === 'rec_watched') && !rec) continue;
        const recScore = d.type === 'rec_watched' && rec ? scores.get(`${actor_id}:${rec.targetType}:${rec.targetId}`) ?? null : undefined;
        out.push({ ...d, actor, rel, ...(req ? { req } : {}), ...(rec ? { rec } : {}), ...(recScore !== undefined ? { recScore } : {}) });
    }
    return out;
}
