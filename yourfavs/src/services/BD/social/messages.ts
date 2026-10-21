/**
 * Mensajes entre amigos: 1:1 (M1) y grupos (M2). Plan docs/Mensajes/PLAN_MENSAJES.md y handoff
 * docs/Mensajes/design_handoff_mensajes/README.md §2.2.
 *
 * Las reglas viven en funciones SQL (migración `20261025090000_messages.sql`, probadas en
 * `supabase/tests/messages_test.sql`): aquí solo se llaman con el cliente admin y `me` de la sesión,
 * y se añaden las personas (nombre, avatar) a lo que devuelven.
 *
 * Lo que sale hacia el navegador nunca dice por qué un 1:1 está en solo lectura (no amigos o
 * bloqueo, en cualquier sentido): solo `readOnly`.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getPeople, getRelations } from './graph';
import { previewOf } from '../../../lib/social/messagesText';
import { resolveCards } from './chatCards';
import type { Json } from '../../../lib/supabase/database.types';
import type {
    ChatMember, ChatMessage, ChatView, ConvKind, ConvRole, ConvSummary, MsgSys, PersonCard, RecCardRef, SpoilerRef, TitleCardRef, WtwCardRef,
} from '../../../lib/social/types';

export const MSG_MAX = 2000;
export const GROUP_NAME_MAX = 40;
export const GROUP_MAX = 10;
export type ReportReason = 'spam' | 'harassment' | 'other';
export const isReportReason = (r: unknown): r is ReportReason => r === 'spam' || r === 'harassment' || r === 'other';

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const db = () => supabaseAdmin();

/** Resultado de una llamada: el dato o el error lanzado. */
function unwrap<T>(r: { data: unknown; error: { message: string } | null }): T {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
}

// -------------------------------------------------------------------------------------
// Filas tal como salen de SQL (msg_view / msg_list / msg_history)
// -------------------------------------------------------------------------------------
interface RawMsg {
    id: number; author: string | null; kind: 'text' | 'system'; body: string | null; sys: MsgSys | null;
    created_at: string; deleted: boolean; folded: boolean; client_id: string | null;
    card?: { type: 'title'; ref: TitleCardRef } | { type: 'rec'; ref: RecCardRef } | { type: 'wtw'; ref: WtwCardRef } | null;
    spoiler?: SpoilerRef | null; locked?: boolean; lines?: number[] | null; spoiler_seen?: boolean;
}
interface RawConv {
    id: number; kind: ConvKind; name: string | null; role: ConvRole; muted: boolean; last_msg_at: string;
    count: number; members: string[]; last: RawMsg | null; unread: number; read_only: boolean; cleared: boolean;
}
interface RawHistory {
    ok: boolean; error?: 'none' | 'left';
    conv: { id: number; kind: ConvKind; name: string | null; created_at: string };
    me: { role: ConvRole; muted: boolean; last_read_id: number | null; joined_at: string };
    members: { id: string; role: ConvRole; joined_at: string }[];
    messages: RawMsg[];
    has_more: boolean;
    deleted_ids: number[] | null;
    seen_id: number | null;
    seen_at: string | null;
    read_only: boolean;
}

export function toMessage(r: RawMsg, me: string): ChatMessage {
    return {
        id: r.id, author: r.author, kind: r.kind, body: r.body, sys: r.sys, at: ms(r.created_at),
        deleted: r.deleted, folded: r.folded, clientId: r.client_id,
        // Solo con la copia guardada: el estado de cada cual lo pone `resolveCards` al pintar.
        card: r.card?.type === 'title' ? { type: 'title', ref: r.card.ref, viewer: null, people: [] }
            : r.card?.type === 'rec' ? { type: 'rec', ref: r.card.ref, dir: r.author === me ? 'out' : 'in', state: r.author === me ? 'sent' : 'pending' }
            : r.card?.type === 'wtw' ? { type: 'wtw', ref: r.card.ref, viewer: null }
            : null,
        spoiler: r.spoiler ?? null, locked: Boolean(r.locked), lines: r.lines ?? null, spoilerSeen: Boolean(r.spoiler_seen),
    };
}

/** Todas las personas que nombra un mensaje (autor y, en los de sistema, quién y a quién). */
function idsOf(m: RawMsg | null): string[] {
    if (!m) return [];
    const out = m.author ? [m.author] : [];
    if (m.sys) {
        if (m.sys.actor) out.push(m.sys.actor);
        out.push(...(m.sys.targets ?? []));
    }
    // «¿Qué vemos?»: las caras de quienes la tienen pendiente (aunque ya no estén en el grupo).
    if (m.card?.type === 'wtw') out.push(...(m.card.ref.have ?? []));
    return out;
}

// -------------------------------------------------------------------------------------
// Lecturas
// -------------------------------------------------------------------------------------

/** Lista de conversaciones de `me`, la más reciente primero (§4.1). */
export async function listConversations(me: string): Promise<ConvSummary[]> {
    const rows = unwrap<RawConv[]>(await db().rpc('msg_list', { p_me: me }));
    const people = await getPeople(rows.flatMap((c) => [...c.members, ...idsOf(c.last)]));
    return rows.map((c) => {
        const group = c.kind === 'group';
        const faces = c.members.map((id) => people.get(id)).filter((p): p is PersonCard => Boolean(p)).slice(0, group ? 2 : 1);
        return {
            id: c.id,
            kind: c.kind,
            title: group ? c.name ?? '' : faces[0]?.name ?? 'Cuenta eliminada',
            faces,
            count: c.count,
            preview: previewOf(c.last ? toMessage(c.last, me) : null, me, group, people),
            lastAt: ms(c.last_msg_at),
            unread: c.unread,
            muted: c.muted,
            readOnly: c.read_only,
            cleared: Boolean(c.cleared),
        };
    });
}

/**
 * «Limpiar» el desplegable de Mensajes de la cabecera (M3b): fuera de él y el contador a 0 hasta que
 * llegue algo nuevo. NO marca como leído (nadie recibe un «Visto»).
 */
export async function clearInbox(me: string): Promise<void> {
    unwrap(await db().rpc('msg_clear_inbox', { p_me: me }));
}

/** Total de sin leer de las conversaciones sin silenciar (contadores `.mcnt`, §6). */
export async function unreadTotal(me: string): Promise<number> {
    return unwrap<number>(await db().rpc('msg_unread_total', { p_me: me })) ?? 0;
}

export type HistoryResult = { ok: true; chat: ChatView } | { ok: false; error: 'none' | 'left' };

/**
 * Una conversación. Sin opciones: los 50 últimos. `before`: 50 más hacia atrás. `after` (+ `from`,
 * el primer id cargado): lo nuevo desde el sondeo anterior y los borrados entre `from` y `after`.
 */
export async function getHistory(
    me: string, conv: number, opts: { before?: number; after?: number; from?: number } = {},
): Promise<HistoryResult> {
    const h = unwrap<RawHistory>(await db().rpc('msg_history', {
        p_me: me, p_conv: conv, p_before: opts.before, p_after: opts.after, p_from: opts.from, p_limit: 50,
    }));
    if (!h.ok) return { ok: false, error: h.error ?? 'none' };
    const group = h.conv.kind === 'group';
    const memberIds = h.members.map((m) => m.id);
    const ids = [me, ...memberIds, ...h.messages.flatMap(idsOf)];
    const others = memberIds.filter((id) => id !== me);
    const messages = h.messages.map((m) => toMessage(m, me));
    const [people, rels] = await Promise.all([
        getPeople(ids),
        // «Has bloqueado» (grupos) y «Amigos desde» (1:1): la relación de quien mira con los demás.
        others.length ? getRelations(me, others) : Promise.resolve(new Map()),
        resolveCards(me, conv, messages, others),
    ]);
    const members: ChatMember[] = h.members
        .map((m) => {
            const person = people.get(m.id);
            if (!person) return null;
            const rel = rels.get(m.id);
            return {
                person, role: m.role, joinedAt: ms(m.joined_at), blockedByMe: group && Boolean(rel?.blockedByMe),
                friend: Boolean(rel?.friends && !rel.blockedByMe),
            };
        })
        .filter((m): m is ChatMember => Boolean(m));
    const other = group ? null : people.get(others[0] ?? '');
    return {
        ok: true,
        chat: {
            id: h.conv.id,
            kind: h.conv.kind,
            title: group ? h.conv.name ?? '' : other?.name ?? 'Cuenta eliminada',
            me: { id: me, role: h.me.role, muted: h.me.muted, lastReadId: h.me.last_read_id },
            members,
            messages,
            people: Object.fromEntries(people),
            hasMore: h.has_more,
            deletedIds: h.deleted_ids ?? [],
            seenId: h.seen_id,
            seenAt: h.seen_at ? ms(h.seen_at) : null,
            readOnly: h.read_only,
            friendsSince: !group && !h.read_only ? rels.get(others[0] ?? '')?.friendsSince ?? null : null,
        },
    };
}

/** «Mostrar igualmente» un spoiler (M4c): su texto, si ves ese mensaje. No guarda nada. */
export async function spoilerBody(me: string, conv: number, msg: number): Promise<string | null> {
    if (!(await belongsTo(msg, conv))) return null;
    return unwrap<string | null>(await db().rpc('msg_spoiler_body', { p_me: me, p_msg: msg }));
}

/** Texto de un mensaje plegado («Mostrar»): solo si es de un grupo y su autor lo bloqueaste tú. */
export async function foldedBody(me: string, conv: number, msg: number): Promise<string | null> {
    if (!(await belongsTo(msg, conv))) return null;
    return unwrap<string | null>(await db().rpc('msg_folded_body', { p_me: me, p_msg: msg }));
}

// -------------------------------------------------------------------------------------
// 1:1
// -------------------------------------------------------------------------------------

/** Uid de un perfil activo por su dirección. */
export async function idByHandle(handle: string): Promise<string | null> {
    const { data, error } = await db().from('profiles').select('id')
        .eq('public_handle', handle).neq('public_visibility', 'off').maybeSingle();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
}

export type OpenDirectResult = { ok: true; id: number } | { ok: false; error: 'not_friends' | 'rate' };

/** Abre el 1:1 con un amigo (el que ya existe, o uno nuevo). */
export async function openDirect(me: string, them: string): Promise<OpenDirectResult> {
    return unwrap<OpenDirectResult>(await db().rpc('msg_open_direct', { p_me: me, p_them: them }));
}

// -------------------------------------------------------------------------------------
// Mensajes
// -------------------------------------------------------------------------------------
export type SendError = 'none' | 'read_only' | 'empty' | 'too_long' | 'rate' | 'card' | 'spoiler';
export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: SendError };
/** Código HTTP de cada error al enviar (`read_only` nunca dice por qué). */
export const SEND_STATUS: Record<SendError, number> = { none: 404, read_only: 403, empty: 400, too_long: 400, rate: 429, card: 400, spoiler: 400 };

/**
 * Un mensaje: texto, o tarjeta de título (`card`, la copia de TMDB) con el texto como comentario.
 * `spoiler` marca el texto como spoiler de una película, un episodio o una serie (M4c).
 */
export async function sendMessage(
    me: string, conv: number, body: string, clientId: string, card: TitleCardRef | null = null, spoiler: SpoilerRef | null = null,
): Promise<SendResult> {
    const r = unwrap<{ ok: boolean; error?: SendError; message?: RawMsg }>(await db().rpc('msg_send', {
        p_me: me, p_conv: conv, p_body: body, p_client: clientId,
        ...(card ? { p_card_type: 'title', p_card_ref: card as unknown as Json } : {}),
        ...(spoiler ? { p_spoiler: spoiler as unknown as Json } : {}),
    }));
    if (!r.ok || !r.message) return { ok: false, error: r.error ?? 'none' };
    const message = toMessage(r.message, me);
    await resolveCards(me, conv, [message]);
    return { ok: true, message };
}

/** Borra uno tuyo de la conversación `conv`. */
export async function deleteMessage(me: string, conv: number, msg: number): Promise<boolean> {
    if (!(await belongsTo(msg, conv))) return false;
    return unwrap<string>(await db().rpc('msg_delete', { p_me: me, p_msg: msg })) === 'ok';
}

/** Deshacer el borrado (10 s como mucho y con el mismo texto). */
export async function restoreMessage(me: string, conv: number, msg: number, body: string): Promise<boolean> {
    if (!(await belongsTo(msg, conv))) return false;
    return unwrap<string>(await db().rpc('msg_restore', { p_me: me, p_msg: msg, p_body: body })) === 'ok';
}

export async function reportMessage(
    me: string, conv: number, msg: number, reason: ReportReason, note: string,
): Promise<'ok' | 'already' | 'none'> {
    if (!(await belongsTo(msg, conv))) return 'none';
    return unwrap(await db().rpc('msg_report', { p_me: me, p_msg: msg, p_reason: reason, p_note: note }));
}

/** Las rutas llevan la conversación y el mensaje: que casen (si no, se trata como «no existe»). */
async function belongsTo(msg: number, conv: number): Promise<boolean> {
    const { data, error } = await db().from('messages').select('conv_id').eq('id', msg).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.conv_id === conv;
}

export async function markRead(me: string, conv: number, lastId: number): Promise<void> {
    unwrap(await db().rpc('msg_read', { p_me: me, p_conv: conv, p_last: lastId }));
}

export async function setMuted(me: string, conv: number, muted: boolean): Promise<boolean> {
    return unwrap<string>(await db().rpc('msg_mute', { p_me: me, p_conv: conv, p_muted: muted })) === 'ok';
}

// -------------------------------------------------------------------------------------
// Grupos (M2)
// -------------------------------------------------------------------------------------
export type CreateGroupError = 'name' | 'too_few' | 'too_many' | 'not_friends' | 'cap' | 'rate';
export type CreateGroupResult =
    | { ok: true; id: number; skipped: string[] }
    | { ok: false; error: CreateGroupError; skipped?: string[] };

export async function createGroup(me: string, name: string, ids: string[]): Promise<CreateGroupResult> {
    return unwrap(await db().rpc('msg_create_group', { p_me: me, p_name: name, p_ids: ids }));
}

export type AddMembersResult =
    | { ok: true; skipped: string[] }
    | { ok: false; error: 'none' | 'not_admin' | 'not_friends' | 'full' };

export async function addMembers(me: string, conv: number, ids: string[]): Promise<AddMembersResult> {
    return unwrap(await db().rpc('msg_add_members', { p_me: me, p_conv: conv, p_ids: ids }));
}

export type AdminResult = 'ok' | 'none' | 'not_admin';

/** Quitar a alguien; si `them` eres tú, es salir del grupo. */
export async function removeMember(me: string, conv: number, them: string): Promise<AdminResult> {
    if (them === me) return unwrap(await db().rpc('msg_leave', { p_me: me, p_conv: conv }));
    return unwrap(await db().rpc('msg_remove_member', { p_me: me, p_conv: conv, p_them: them }));
}

export async function makeAdmin(me: string, conv: number, them: string): Promise<AdminResult> {
    return unwrap(await db().rpc('msg_make_admin', { p_me: me, p_conv: conv, p_them: them }));
}

export async function renameGroup(me: string, conv: number, name: string): Promise<AdminResult | 'name'> {
    return unwrap(await db().rpc('msg_rename', { p_me: me, p_conv: conv, p_name: name }));
}

/**
 * Amigos de `me` con lo que necesita el selector de grupo (§4.9): si ya están en el grupo `conv`
 * y si están en 20 grupos («Está en demasiados grupos»).
 */
export async function groupCandidates(
    me: string, conv: number | null,
): Promise<{ person: PersonCard; inGroup: boolean; full: boolean }[]> {
    const d = db();
    const [x, y] = await Promise.all([
        d.from('friendships').select('b_id').eq('a_id', me).is('ended_at', null),
        d.from('friendships').select('a_id').eq('b_id', me).is('ended_at', null),
    ]);
    if (x.error) throw new Error(x.error.message);
    if (y.error) throw new Error(y.error.message);
    // Nunca alguien con un bloqueo de por medio (no se le podría añadir; la base lo rechaza igual).
    const [bx, by] = await Promise.all([
        d.from('blocks').select('blocked_id').eq('blocker_id', me),
        d.from('blocks').select('blocker_id').eq('blocked_id', me),
    ]);
    if (bx.error) throw new Error(bx.error.message);
    if (by.error) throw new Error(by.error.message);
    const blocked = new Set([...(bx.data ?? []).map((r) => r.blocked_id), ...(by.data ?? []).map((r) => r.blocker_id)]);
    const ids = [...(x.data ?? []).map((r) => r.b_id), ...(y.data ?? []).map((r) => r.a_id)].filter((id) => !blocked.has(id));
    if (!ids.length) return [];
    const [people, inGroup, groups] = await Promise.all([
        getPeople(ids),
        conv
            ? d.from('conversation_members').select('user_id').eq('conv_id', conv).is('left_at', null).in('user_id', ids)
            : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
        d.from('conversation_members').select('user_id, conversations!inner(kind)')
            .in('user_id', ids).is('left_at', null).eq('conversations.kind', 'group'),
    ]);
    if (inGroup.error) throw new Error(inGroup.error.message);
    if (groups.error) throw new Error(groups.error.message);
    const inSet = new Set((inGroup.data ?? []).map((r) => r.user_id));
    const count = new Map<string, number>();
    for (const r of groups.data ?? []) count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1);
    return ids
        .map((id) => people.get(id))
        .filter((p): p is PersonCard => Boolean(p))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((person) => ({ person, inGroup: inSet.has(person.id), full: (count.get(person.id) ?? 0) >= 20 }));
}

/** Cuántos amigos tiene `me` (sin amigos no hay «Nuevo grupo», handoff §4.1). */
export async function friendCount(me: string): Promise<number> {
    const d = db();
    const [x, y] = await Promise.all([
        d.from('friendships').select('b_id', { count: 'exact', head: true }).eq('a_id', me).is('ended_at', null),
        d.from('friendships').select('a_id', { count: 'exact', head: true }).eq('b_id', me).is('ended_at', null),
    ]);
    if (x.error) throw new Error(x.error.message);
    if (y.error) throw new Error(y.error.message);
    return (x.count ?? 0) + (y.count ?? 0);
}

// -------------------------------------------------------------------------------------
// «Enviar a…» (M4, handoff M4 §3.5)
// -------------------------------------------------------------------------------------

/**
 * A dónde se puede mandar algo: tus conversaciones en las que puedes escribir (la más reciente
 * primero; las de solo lectura no salen) y tus amigos con los que aún no tienes un 1:1.
 */
export async function sendTargets(me: string): Promise<{ convs: ConvSummary[]; friends: PersonCard[] }> {
    const [convs, cands] = await Promise.all([listConversations(me), groupCandidates(me, null)]);
    const open = convs.filter((c) => !c.readOnly);
    const withDirect = new Set(convs.filter((c) => c.kind === 'direct').flatMap((c) => c.faces.map((f) => f.id)));
    const friends = cands.map((c) => c.person).filter((p) => !withDirect.has(p.id) && p.handle);
    return { convs: open, friends };
}
