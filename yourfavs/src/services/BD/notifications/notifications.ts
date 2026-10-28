/**
 * Buzón de notificaciones (Bloque 4 · la campana).
 *
 * Tabla `notifications` (antes users/{uid}/notifications/{deterministicId}) → { type, title, subtitle, href,
 * poster_path, created_at, read }. El id es DETERMINISTA (p.ej. episode:1399:T2·E5)
 * para que re-sincronizar (materializar al abrir) sea idempotente y no duplique ni
 * pise el estado `read`. Ver el generador en services/API/notifications/generator.ts.
 */
import { db, getAuthId, requireAuthId } from '../shared/userScope';

export type NotifType = 'new_episode' | 'on_platform' | 'person_release' | 'anniversary' | 'platform_change' | 'streak'
    // Títulos (N1/N2, 2026-10-28): temporada nueva de una serie de tus listas o suscrita
    // (`season:tv:{id}:S{n}`) y estreno en cines o en digital (`premiere:…`, `digital:…`) de una
    // película suscrita o de quien sigues. Ver `services/API/notifications/titleSignals.ts`.
    | 'new_season' | 'premiere'
    // Entre personas (capa social). No los crea el generador: los escribe el servidor en el buzón de
    // quien los recibe al pasar (`social_follow`, migración 20261020090000).
    | 'follow' | 'friend_request' | 'friend_accepted'
    // Recomendaciones (F4): `rec:{id}` para quien la recibe, `recrep:{id}:{uid}` para quien la envió.
    // F6: `recseen:{id}:{uid}`, quien la recibió ya la vio (lo escribe un trigger de la BD).
    | 'recommendation' | 'rec_reply' | 'rec_watched'
    // Planes para verla (Mensajes M5): a quien dijo «Voy», al cambiarse o cancelarse, y el día del
    // plan (`plan_today`, M5b). El texto ya viene escrito (`title`/`subtitle`) y `href` lleva a la
    // conversación.
    | 'plan_changed' | 'plan_cancelled' | 'plan_today';

export interface NotificationDoc {
    id: string;
    type: NotifType;
    title: string;
    subtitle: string;
    href: string;
    poster_path: string | null;
    created_at: number; // ms
    read: boolean;
    /** Quién lo provocó, en los avisos entre personas. */
    actor_id: string | null;
}

export interface NotifInput {
    id: string;
    type: NotifType;
    title: string;
    subtitle: string;
    href: string;
    poster_path: string | null;
    created_at?: number;
}

// Tipos que la campana muestra hoy. El viejo 'on_platform' se retiró (sin detección de
// cambios volcaba toda la watchlist) y sigue ignorado para que los docs antiguos
// desaparezcan solos; su relevo es 'platform_change', que SOLO se materializa cuando un
// pendiente ENTRA o SALE de tus plataformas (diff contra snapshot, ver el generador).
const ACTIVE_TYPES = new Set<NotifType>(['new_episode', 'new_season', 'premiere', 'person_release', 'anniversary', 'platform_change', 'streak', 'follow', 'friend_request', 'friend_accepted', 'recommendation', 'rec_reply', 'rec_watched', 'plan_changed', 'plan_cancelled', 'plan_today']);

function toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
}

export async function listNotifications(limit = 30): Promise<NotificationDoc[]> {
    const userId = getAuthId();
    if (!userId) return [];
    try {
        // Solo los tipos activos, filtrados en la BD (en Firestore se pedía de más y se filtraba
        // en memoria para no necesitar un índice compuesto).
        const { data, error } = await db().from('notifications')
            .select('id, type, title, subtitle, href, poster_path, created_at, read, actor_id')
            .eq('user_id', userId).in('type', [...ACTIVE_TYPES])
            .order('created_at', { ascending: false }).limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? [])
            .map((x) => {
                return {
                    id: x.id,
                    type: x.type,
                    title: x.title || '',
                    subtitle: x.subtitle || '',
                    href: x.href || '#',
                    poster_path: x.poster_path ?? null,
                    created_at: toMs(x.created_at),
                    read: !!x.read,
                    actor_id: x.actor_id ?? null,
                } as NotificationDoc;
            });
    } catch (error) {
        console.error('Error al leer notifications:', error);
        return [];
    }
}

export async function unreadCount(): Promise<number> {
    const userId = getAuthId();
    if (!userId) return 0;
    try {
        // Un count en la BD (índice parcial de no leídas); antes se leían todas para contarlas.
        const { count, error } = await db().from('notifications').select('id', { count: 'exact', head: true })
            .eq('user_id', userId).eq('read', false).in('type', [...ACTIVE_TYPES]);
        if (error) throw new Error(error.message);
        return count ?? 0;
    } catch {
        return 0;
    }
}

export async function markRead(id: string): Promise<void> {
    const { error } = await db().from('notifications').update({ read: true }).eq('user_id', requireAuthId()).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function markAllRead(): Promise<void> {
    const { error } = await db().from('notifications').update({ read: true }).eq('user_id', requireAuthId()).eq('read', false);
    if (error) throw new Error(error.message);
}

/**
 * Upsert idempotente: crea las nuevas (read:false) y refresca el contenido de las
 * existentes SIN tocar su `read` ni su `created_at`. Se miran solo los ids que llegan
 * (antes se leían los de TODAS las notificaciones para saberlo).
 */
export async function upsertMany(items: NotifInput[]): Promise<void> {
    if (!items.length) return;
    const userId = requireAuthId();
    const ids = [...new Set(items.map((it) => it.id))];
    const { data: existing, error: readError } = await db().from('notifications').select('id').eq('user_id', userId).in('id', ids);
    if (readError) throw new Error(readError.message);
    const known = new Set((existing ?? []).map((r) => r.id));
    const content = (it: NotifInput) => ({
        user_id: userId, id: it.id, type: it.type, title: it.title, subtitle: it.subtitle,
        href: it.href, poster_path: it.poster_path,
    });
    // Últimas por id (por si el lote trae un id dos veces).
    const byId = new Map(items.map((it) => [it.id, it]));
    const fresh = [...byId.values()].filter((it) => !known.has(it.id))
        .map((it) => ({ ...content(it), created_at: new Date(it.created_at ?? Date.now()).toISOString(), read: false }));
    const refreshed = [...byId.values()].filter((it) => known.has(it.id)).map(content);
    if (fresh.length) {
        const { error } = await db().from('notifications').insert(fresh);
        if (error) throw new Error(error.message);
    }
    if (refreshed.length) {
        // Solo columnas de contenido → read y created_at se quedan como estaban.
        const { error } = await db().from('notifications').upsert(refreshed, { onConflict: 'user_id,id' });
        if (error) throw new Error(error.message);
    }
}
