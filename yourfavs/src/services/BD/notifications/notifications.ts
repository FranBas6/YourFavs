/**
 * Buzón de notificaciones (Bloque 4 · la campana).
 *
 * users/{uid}/notifications/{deterministicId} → { type, title, subtitle, href,
 * poster_path, created_at, read }. El id es DETERMINISTA (p.ej. episode:1399:T2·E5)
 * para que re-sincronizar (materializar al abrir) sea idempotente y no duplique ni
 * pise el estado `read`. Ver el generador en services/API/notifications/generator.ts.
 */
import { userCol, userDoc, requireUid, getCurrentUid } from '../shared/userScope';
import { adminDb } from '../../../utils/firebaseAdmin';

export type NotifType = 'new_episode' | 'on_platform' | 'person_release' | 'anniversary' | 'platform_change';

export interface NotificationDoc {
    id: string;
    type: NotifType;
    title: string;
    subtitle: string;
    href: string;
    poster_path: string | null;
    created_at: number; // ms
    read: boolean;
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

const COL = 'notifications';

// Tipos que la campana muestra hoy. El viejo 'on_platform' se retiró (sin detección de
// cambios volcaba toda la watchlist) y sigue ignorado para que los docs antiguos
// desaparezcan solos; su relevo es 'platform_change', que SOLO se materializa cuando un
// pendiente ENTRA o SALE de tus plataformas (diff contra snapshot, ver el generador).
const ACTIVE_TYPES = new Set<NotifType>(['new_episode', 'person_release', 'anniversary', 'platform_change']);

function toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
}

export async function listNotifications(limit = 30): Promise<NotificationDoc[]> {
    if (!getCurrentUid()) return [];
    try {
        // Pedimos de más y filtramos los tipos obsoletos en memoria (evita índice compuesto).
        const snap = await userCol(COL).orderBy('created_at', 'desc').limit(limit * 2).get();
        return snap.docs
            .map((d) => {
                const x = d.data();
                return {
                    id: d.id,
                    type: x.type,
                    title: x.title || '',
                    subtitle: x.subtitle || '',
                    href: x.href || '#',
                    poster_path: x.poster_path ?? null,
                    created_at: toMs(x.created_at),
                    read: !!x.read,
                };
            })
            .filter((n) => ACTIVE_TYPES.has(n.type))
            .slice(0, limit);
    } catch (error) {
        console.error('Error al leer notifications:', error);
        return [];
    }
}

export async function unreadCount(): Promise<number> {
    if (!getCurrentUid()) return 0;
    try {
        const snap = await userCol(COL).where('read', '==', false).get();
        return snap.docs.filter((d) => ACTIVE_TYPES.has(d.data().type)).length;
    } catch {
        return 0;
    }
}

export async function markRead(id: string): Promise<void> {
    await userDoc(COL, id).set({ read: true }, { merge: true });
}

export async function markAllRead(): Promise<void> {
    const snap = await userCol(COL).where('read', '==', false).get();
    if (snap.empty) return;
    const batch = adminDb.batch();
    snap.docs.forEach((d) => batch.set(d.ref, { read: true }, { merge: true }));
    await batch.commit();
}

/**
 * Upsert idempotente: crea las nuevas (read:false) y refresca el contenido de las
 * existentes SIN tocar su `read` (leemos solo los ids para saber cuáles ya están).
 */
export async function upsertMany(items: NotifInput[]): Promise<void> {
    if (!items.length) return;
    requireUid();
    const existing = await userCol(COL).select().get(); // solo ids → lectura mínima
    const known = new Set(existing.docs.map((d) => d.id));
    const batch = adminDb.batch();
    for (const it of items) {
        const ref = userDoc(COL, it.id);
        const content = {
            type: it.type, title: it.title, subtitle: it.subtitle,
            href: it.href, poster_path: it.poster_path,
        };
        if (known.has(it.id)) {
            batch.set(ref, content, { merge: true }); // preserva read + created_at
        } else {
            batch.set(ref, { ...content, created_at: it.created_at ?? Date.now(), read: false });
        }
    }
    await batch.commit();
}
