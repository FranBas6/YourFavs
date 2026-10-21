/**
 * Llamadas del navegador a `/api/social/messages/*` (handoff de mensajes §7). Todas devuelven
 * `{ ok, status, data }`; nunca lanzan (sin red → `status: 0`), para que el que llama decida entre
 * «No se ha enviado · Reintentar», un toast o el vacío de error.
 */
import type { ChatMessage, ChatView, ConvSummary, PersonCard } from '../../../lib/social/types';

const BASE = '/api/social/messages';

export interface ApiResult<T> { ok: boolean; status: number; data: T & { ok?: boolean; error?: string } }

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    try {
        const r = await fetch(BASE + path, {
            method,
            headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        return { ok: r.ok && data?.ok !== false, status: r.status, data };
    } catch {
        return { ok: false, status: 0, data: { ok: false, error: 'network' } as unknown as T & { error: string } };
    }
}

export const msgApi = {
    list: () => call<{ convs: ConvSummary[] }>('GET', ''),
    unread: () => call<{ total: number }>('GET', '/unread'),
    openDirect: (who: { handle: string } | { userId: string }) => call<{ id: number }>('POST', '/direct', who),
    createGroup: (name: string, ids: string[]) => call<{ id: number; skipped: string[] }>('POST', '/groups', { name, ids }),
    candidates: (conv?: number) =>
        call<{ people: { person: PersonCard; inGroup: boolean; full: boolean }[] }>('GET', `/candidates${conv ? `?conv=${conv}` : ''}`),

    chat: (conv: number, q: { before?: number; after?: number; from?: number } = {}) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v));
        const qs = p.toString();
        return call<{ chat: ChatView }>('GET', `/${conv}${qs ? `?${qs}` : ''}`);
    },
    patch: (conv: number, body: { name?: string; muted?: boolean }) => call('PATCH', `/${conv}`, body),
    read: (conv: number, lastId: number) => call('POST', `/${conv}/read`, { lastId }),

    send: (conv: number, body: string, clientId: string) => call<{ message: ChatMessage }>('POST', `/${conv}/messages`, { body, clientId }),
    remove: (conv: number, msg: number) => call('DELETE', `/${conv}/messages/${msg}`),
    restore: (conv: number, msg: number, body: string) => call('POST', `/${conv}/messages/${msg}/restore`, { body }),
    folded: (conv: number, msg: number) => call<{ body: string }>('GET', `/${conv}/messages/${msg}/folded`),
    report: (conv: number, msg: number, reason: 'spam' | 'harassment' | 'other', note?: string) =>
        call('POST', `/${conv}/messages/${msg}/report`, { reason, note }),

    addMembers: (conv: number, ids: string[]) => call<{ skipped: string[] }>('POST', `/${conv}/members`, { ids }),
    removeMember: (conv: number, uid: string) => call('DELETE', `/${conv}/members/${uid}`),
    makeAdmin: (conv: number, uid: string) => call('POST', `/${conv}/members/${uid}/admin`),
};
