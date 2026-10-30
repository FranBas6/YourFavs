/**
 * Recomendar a un amigo (F4 de la capa social; handoff docs/design_handoff_social_f4 §4).
 *
 * Las reglas que cambian datos son funciones SQL (migración `20261022090000_social_recommendations`):
 * enviar (solo amigos, sin duplicados, topes), retirar, actuar y responder una vez. Aquí está lo
 * demás, con el cliente admin y los uid explícitos (`me` sale siempre de la sesión):
 *
 *   · Lo que implica actuar (guardar en Pendientes, activar avisos de una persona) se hace con los
 *     servicios de siempre, que trabajan con la sesión de quien recibe (es `me`).
 *   · «Ya la tenías» y «Ya la viste» se calculan AL LEER, mirando las listas, el diario y los avisos
 *     de quien recibe. Nunca salen hacia quien envía.
 *   · Quien envía solo ve «Enviada» o «La añadió a Pendientes» (o «Activó los avisos»): descartar o
 *     abrir sin responder se le enseña como «Enviada» (privacidad de quien recibe).
 *   · Con un bloqueo en cualquier sentido, las recomendaciones entre esas dos personas no se pintan.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getPeople } from './graph';
import { saveFixed } from '../lists/fixedLists';
import { addFollowedPerson } from '../people/yourfavsPeople';
import type {
    PersonCard, QuickKey, RecReceived, RecReply, RecSent, RecShown, RecStatus, RecTarget, RecView,
} from '../../../lib/social/types';

export type RecAction = 'add' | 'alerts' | 'open' | 'discard';
const ACTION_STATUS: Record<RecAction, RecStatus> = { add: 'added', alerts: 'alerts', open: 'opened', discard: 'discarded' };
const QUICK_KEYS = new Set<QuickKey>(['thanks', 'seen_it', 'saving', 'not_for_me']);
export const isQuickKey = (k: unknown): k is QuickKey => typeof k === 'string' && QUICK_KEYS.has(k as QuickKey);
export const isRecTarget = (t: unknown): t is RecTarget => t === 'movie' || t === 'tv' || t === 'person' || t === 'company';

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const DAY = 24 * 60 * 60 * 1000;

interface RecRow {
    id: number; from_id: string; target_type: string; target_id: number; title: string;
    image_path: string | null; message: string | null; created_at: string;
}
interface RcptRow {
    rec_id: number; to_id: string; status: string; acted_at: string | null;
    reply_kind: string | null; reply_key: string | null; reply_text: string | null; replied_at: string | null;
}
const REC_COLS = 'id, from_id, target_type, target_id, title, image_path, message, created_at';
const RCPT_COLS = 'rec_id, to_id, status, acted_at, reply_kind, reply_key, reply_text, replied_at';

function toReply(r: RcptRow): RecReply | null {
    if (!r.reply_kind) return null;
    return { kind: r.reply_kind as 'quick' | 'text', key: (r.reply_key as QuickKey) ?? null, text: r.reply_text, at: ms(r.replied_at) };
}

/** Personas con las que hay un bloqueo en cualquier sentido (sus recomendaciones no se pintan). */
async function blockedWith(me: string): Promise<Set<string>> {
    const db = supabaseAdmin();
    const [a, b] = await Promise.all([
        db.from('blocks').select('blocked_id').eq('blocker_id', me),
        db.from('blocks').select('blocker_id').eq('blocked_id', me),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (b.error) throw new Error(b.error.message);
    return new Set([...(a.data ?? []).map((r) => r.blocked_id), ...(b.data ?? []).map((r) => r.blocker_id)]);
}

/** Amigos de `me` (ids), con desde cuándo. */
async function friendIds(me: string): Promise<{ id: string; since: number }[]> {
    const db = supabaseAdmin();
    const [x, y] = await Promise.all([
        db.from('friendships').select('b_id, since').eq('a_id', me).is('ended_at', null),
        db.from('friendships').select('a_id, since').eq('b_id', me).is('ended_at', null),
    ]);
    if (x.error) throw new Error(x.error.message);
    if (y.error) throw new Error(y.error.message);
    return [
        ...(x.data ?? []).map((r) => ({ id: r.b_id, since: ms(r.since) })),
        ...(y.data ?? []).map((r) => ({ id: r.a_id, since: ms(r.since) })),
    ];
}

// -------------------------------------------------------------------------------------
// «Ya la tenías» / «Ya la viste» de quien recibe (calculado al leer, nunca guardado)
// -------------------------------------------------------------------------------------
type OwnState = 'had' | 'seen' | null;
const key = (t: string, id: number) => `${t}:${id}`;

async function ownStates(me: string, targets: { type: string; id: number }[]): Promise<Map<string, OwnState>> {
    const out = new Map<string, OwnState>();
    const db = supabaseAdmin();
    const titles = targets.filter((t) => t.type === 'movie' || t.type === 'tv');
    const people = targets.filter((t) => t.type === 'person');
    const titleIds = [...new Set(titles.map((t) => t.id))];
    const personIds = [...new Set(people.map((t) => t.id))];
    const [lib, log, fol] = await Promise.all([
        titleIds.length ? db.from('library_items').select('media_type, tmdb_id, collection').eq('user_id', me).in('tmdb_id', titleIds) : null,
        titleIds.length ? db.from('watch_log').select('media_type, tmdb_id').eq('user_id', me).in('tmdb_id', titleIds).limit(1000) : null,
        personIds.length ? db.from('followed_people').select('person_id').eq('user_id', me).in('person_id', personIds) : null,
    ]);
    for (const r of [lib, log, fol]) if (r?.error) throw new Error(r.error.message);
    for (const r of lib?.data ?? []) {
        const k = key(r.media_type, r.tmdb_id);
        const seen = r.collection === 'MoviesVistas' || r.collection === 'SeriesVistas';
        if (seen) out.set(k, 'seen'); else if (!out.has(k)) out.set(k, 'had');
    }
    for (const r of log?.data ?? []) out.set(key(r.media_type, r.tmdb_id), 'seen');
    for (const r of fol?.data ?? []) out.set(key('person', r.person_id), 'had');
    return out;
}

function shownFor(rc: RcptRow, own: OwnState): RecShown {
    if (rc.status !== 'pending') return rc.status as RecStatus;
    return own ?? 'pending';
}

function toView(r: RecRow, rc: RcptRow, own: OwnState): RecView {
    return {
        id: r.id, targetType: r.target_type as RecTarget, targetId: r.target_id, title: r.title,
        image: r.image_path, message: r.message, createdAt: ms(r.created_at),
        shown: shownFor(rc, own), reply: toReply(rc),
    };
}

// -------------------------------------------------------------------------------------
// Selector
// -------------------------------------------------------------------------------------
export interface PickerFriends {
    friends: PersonCard[];
    /** Hasta 3: a quién más has recomendado en 60 días o, si no, los amigos más recientes. */
    recent: string[];
    /** Ya tienen ESTO tuyo pendiente y sin responder (no se pueden marcar). */
    alreadySent: string[];
}

export async function pickerFriends(me: string, target: { type: RecTarget; id: number } | null): Promise<PickerFriends> {
    const db = supabaseAdmin();
    const [fr, blocked] = await Promise.all([friendIds(me), blockedWith(me)]);
    const ids = fr.map((f) => f.id).filter((id) => !blocked.has(id));
    if (!ids.length) return { friends: [], recent: [], alreadySent: [] };
    const people = await getPeople(ids);
    const friends = ids.map((id) => people.get(id)).filter((p): p is PersonCard => Boolean(p))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    // A quién has recomendado más en 60 días.
    const since = new Date(Date.now() - 60 * DAY).toISOString();
    const { data: mine, error } = await db.from('recommendations').select('id').eq('from_id', me).gte('created_at', since).limit(500);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    if (mine?.length) {
        const { data: rc, error: e2 } = await db.from('recommendation_recipients').select('to_id').in('rec_id', mine.map((r) => r.id));
        if (e2) throw new Error(e2.message);
        for (const r of rc ?? []) if (ids.includes(r.to_id)) counts.set(r.to_id, (counts.get(r.to_id) ?? 0) + 1);
    }
    let recent = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    if (!recent.length) recent = [...fr].filter((f) => ids.includes(f.id)).sort((a, b) => b.since - a.since).slice(0, 3).map((f) => f.id);

    let alreadySent: string[] = [];
    if (target) {
        const { data: same, error: e3 } = await db.from('recommendations').select('id')
            .eq('from_id', me).eq('target_type', target.type).eq('target_id', target.id);
        if (e3) throw new Error(e3.message);
        if (same?.length) {
            const { data: rc, error: e4 } = await db.from('recommendation_recipients').select('to_id')
                .in('rec_id', same.map((r) => r.id)).eq('status', 'pending').is('reply_kind', null);
            if (e4) throw new Error(e4.message);
            alreadySent = [...new Set((rc ?? []).map((r) => r.to_id))];
        }
    }
    return { friends, recent, alreadySent };
}

/** Modo «elegir título»: el amigo por su dirección y lo que ya le has recomendado sin respuesta. */
export async function pickerFriend(me: string, handle: string): Promise<{ friend: PersonCard; sentTargets: string[] } | null> {
    const db = supabaseAdmin();
    const { data: row, error } = await db.from('profiles').select('id').eq('public_handle', handle.toLowerCase()).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const [fr, blocked] = await Promise.all([friendIds(me), blockedWith(me)]);
    if (!fr.some((f) => f.id === row.id) || blocked.has(row.id)) return null;
    const friend = (await getPeople([row.id])).get(row.id);
    if (!friend) return null;
    const { data: rc, error: e2 } = await db.from('recommendation_recipients').select('rec_id')
        .eq('to_id', row.id).eq('status', 'pending').is('reply_kind', null).limit(500);
    if (e2) throw new Error(e2.message);
    let sentTargets: string[] = [];
    if (rc?.length) {
        const { data: recs, error: e3 } = await db.from('recommendations').select('target_type, target_id')
            .eq('from_id', me).in('id', rc.map((r) => r.rec_id));
        if (e3) throw new Error(e3.message);
        sentTargets = (recs ?? []).map((r) => key(r.target_type, r.target_id));
    }
    return { friend, sentTargets };
}

// -------------------------------------------------------------------------------------
// Escrituras
// -------------------------------------------------------------------------------------
export interface SendInput { type: RecTarget; id: number; title: string; image: string | null; to: string[]; message: string | null }
export type SendResult = { ok: true; recId: number; skipped: string[] } | { ok: false; error: string; skipped: string[] };

export async function sendRec(me: string, i: SendInput): Promise<SendResult> {
    const { data, error } = await supabaseAdmin().rpc('social_rec_send', {
        p_me: me, p_type: i.type, p_id: i.id, p_title: i.title, p_image: i.image ?? '', p_to: i.to, p_message: i.message ?? '',
    });
    if (error) throw new Error(error.message);
    const d = data as { ok: boolean; rec_id?: number; error?: string; skipped?: string[] };
    return d.ok ? { ok: true, recId: d.rec_id!, skipped: d.skipped ?? [] } : { ok: false, error: d.error ?? 'error', skipped: d.skipped ?? [] };
}

export async function withdrawRec(me: string, recId: number): Promise<{ ok: boolean; error?: string; withdrawnFor?: string[] }> {
    const { data, error } = await supabaseAdmin().rpc('social_rec_withdraw', { p_me: me, p_rec: recId });
    if (error) throw new Error(error.message);
    const d = data as { ok: boolean; error?: string; withdrawn_for?: string[] };
    return { ok: d.ok, error: d.error, withdrawnFor: d.withdrawn_for };
}

/** Una recomendación recibida por `me`, con su estado para pintar. null si no existe o hay bloqueo. */
export async function receivedOne(me: string, recId: number): Promise<RecReceived | null> {
    const db = supabaseAdmin();
    const [{ data: rec, error }, { data: rc, error: e2 }] = await Promise.all([
        db.from('recommendations').select(REC_COLS).eq('id', recId).maybeSingle(),
        db.from('recommendation_recipients').select(RCPT_COLS).eq('rec_id', recId).eq('to_id', me).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (e2) throw new Error(e2.message);
    if (!rec || !rc) return null;
    if ((await blockedWith(me)).has(rec.from_id)) return null;
    const [own, people] = await Promise.all([ownStates(me, [{ type: rec.target_type, id: rec.target_id }]), getPeople([rec.from_id])]);
    const from = people.get(rec.from_id);
    if (!from) return null;
    return { ...toView(rec as RecRow, rc as RcptRow, own.get(key(rec.target_type, rec.target_id)) ?? null), from };
}

/**
 * Actuar sobre una recomendación recibida: hace lo que implica con la sesión de quien recibe y
 * luego la marca. Devuelve la recomendación como queda, o null si ya no estaba pendiente.
 */
export async function actRec(me: string, recId: number, action: RecAction): Promise<RecReceived | null> {
    const cur = await receivedOne(me, recId);
    if (!cur || (cur.shown !== 'pending' && cur.shown !== 'had' && cur.shown !== 'seen')) return null;
    const t = cur.targetType;
    // La acción tiene que encajar con lo recomendado.
    if (action === 'add' && t !== 'movie' && t !== 'tv') return null;
    if (action === 'alerts' && t !== 'person') return null;
    if (action === 'open' && t !== 'company') return null;
    if (action === 'add') await saveFixed(t as 'movie' | 'tv', cur.targetId, 'pendientes', 'add');
    if (action === 'alerts') await addFollowedPerson(String(cur.targetId), cur.title, cur.image);
    const { data, error } = await supabaseAdmin().rpc('social_rec_act', { p_me: me, p_rec: recId, p_status: ACTION_STATUS[action] });
    if (error) throw new Error(error.message);
    if (data !== 'ok') return null;
    return receivedOne(me, recId);
}

export type ReplyResult = 'ok' | 'already' | 'pending' | 'none';

export async function replyRec(me: string, recId: number, reply: { key: QuickKey } | { text: string }): Promise<{ result: ReplyResult; rec: RecReceived | null }> {
    const cur = await receivedOne(me, recId);
    if (!cur) return { result: 'none', rec: null };
    const canPending = cur.shown === 'had' || cur.shown === 'seen';
    const { data, error } = await supabaseAdmin().rpc('social_rec_reply', {
        p_me: me, p_rec: recId,
        p_key: 'key' in reply ? reply.key : '',
        p_text: 'text' in reply ? reply.text : '',
        p_can_pending: canPending,
    });
    if (error) throw new Error(error.message);
    return { result: data as ReplyResult, rec: data === 'ok' ? await receivedOne(me, recId) : cur };
}

// -------------------------------------------------------------------------------------
// Listas (centro «Amigos» → Pendientes) y avisos
// -------------------------------------------------------------------------------------

/** Recibidas: pendientes primero; luego las ya respondidas o resueltas de los últimos 30 días. */
export async function listReceived(me: string): Promise<RecReceived[]> {
    const db = supabaseAdmin();
    const { data: rcs, error } = await db.from('recommendation_recipients').select(RCPT_COLS)
        .eq('to_id', me).order('rec_id', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    if (!rcs?.length) return [];
    const { data: recs, error: e2 } = await db.from('recommendations').select(REC_COLS).in('id', rcs.map((r) => r.rec_id));
    if (e2) throw new Error(e2.message);
    const blocked = await blockedWith(me);
    const byId = new Map((recs ?? []).map((r) => [r.id, r as RecRow]));
    const rows = (rcs as RcptRow[]).map((rc) => ({ rc, rec: byId.get(rc.rec_id) }))
        .filter((x): x is { rc: RcptRow; rec: RecRow } => Boolean(x.rec) && !blocked.has(x.rec!.from_id));
    const [own, people] = await Promise.all([
        ownStates(me, rows.map((x) => ({ type: x.rec.target_type, id: x.rec.target_id }))),
        getPeople(rows.map((x) => x.rec.from_id)),
    ]);
    const now = Date.now();
    const out: RecReceived[] = [];
    for (const { rc, rec } of rows) {
        const from = people.get(rec.from_id);
        if (!from) continue;
        const v = toView(rec, rc, own.get(key(rec.target_type, rec.target_id)) ?? null);
        const open = !v.reply && (v.shown === 'pending' || v.shown === 'had' || v.shown === 'seen');
        const recent = now - Math.max(ms(rc.acted_at), ms(rc.replied_at), v.createdAt) < 30 * DAY;
        if (open || recent) out.push({ ...v, from });
    }
    // Sin responder primero (en su orden: lo más nuevo arriba).
    const isOpen = (r: RecReceived) => !r.reply && (r.shown === 'pending' || r.shown === 'had' || r.shown === 'seen');
    return out.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.createdAt - a.createdAt);
}

export const isUnanswered = (r: Pick<RecView, 'reply' | 'shown'>) =>
    !r.reply && (r.shown === 'pending' || r.shown === 'had' || r.shown === 'seen');

/** Enviadas: una por recomendación, con lo que cada destinatario deja ver. */
export async function listSent(me: string, limit = 50): Promise<RecSent[]> {
    const db = supabaseAdmin();
    const { data: recs, error } = await db.from('recommendations').select(REC_COLS)
        .eq('from_id', me).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    if (!recs?.length) return [];
    const { data: rcs, error: e2 } = await db.from('recommendation_recipients').select(RCPT_COLS).in('rec_id', recs.map((r) => r.id));
    if (e2) throw new Error(e2.message);
    const blocked = await blockedWith(me);
    const people = await getPeople((rcs ?? []).map((r) => r.to_id));
    return (recs as RecRow[]).map((rec) => ({
        id: rec.id, targetType: rec.target_type as RecTarget, targetId: rec.target_id, title: rec.title,
        image: rec.image_path, message: rec.message, createdAt: ms(rec.created_at),
        recipients: ((rcs ?? []) as RcptRow[]).filter((r) => r.rec_id === rec.id && !blocked.has(r.to_id)).flatMap((r) => {
            const person = people.get(r.to_id);
            if (!person) return [];
            // Descartar o abrir sin responder se ve como «Enviada»: quien envía no se entera.
            const visible = r.status === 'added' ? 'added' : r.status === 'alerts' ? 'alerts' : 'sent';
            return [{ person, visible, reply: toReply(r) } as const];
        }),
    })).filter((r) => r.recipients.length > 0);
}

/** Para los avisos: las recomendaciones de esos ids vistas por `me` (recibidas) o enviadas por `me`. */
export async function recViewsForNotifs(me: string, received: number[], sent: number[]): Promise<{ received: Map<number, RecView>; sent: Map<number, RecView> }> {
    const out = { received: new Map<number, RecView>(), sent: new Map<number, RecView>() };
    const ids = [...new Set([...received, ...sent])];
    if (!ids.length) return out;
    const db = supabaseAdmin();
    const [{ data: recs, error }, rcRes] = await Promise.all([
        db.from('recommendations').select(REC_COLS).in('id', ids),
        received.length ? db.from('recommendation_recipients').select(RCPT_COLS).eq('to_id', me).in('rec_id', received) : null,
    ]);
    if (error) throw new Error(error.message);
    if (rcRes?.error) throw new Error(rcRes.error.message);
    const byId = new Map((recs ?? []).map((r) => [r.id, r as RecRow]));
    const rcById = new Map(((rcRes?.data ?? []) as RcptRow[]).map((r) => [r.rec_id, r]));
    const recvRecs = received.map((id) => byId.get(id)).filter((r): r is RecRow => Boolean(r));
    const own = await ownStates(me, recvRecs.map((r) => ({ type: r.target_type, id: r.target_id })));
    for (const rec of recvRecs) {
        const rc = rcById.get(rec.id);
        if (rc) out.received.set(rec.id, toView(rec, rc, own.get(key(rec.target_type, rec.target_id)) ?? null));
    }
    for (const id of sent) {
        const rec = byId.get(id);
        if (rec && rec.from_id === me) {
            out.sent.set(id, { id, targetType: rec.target_type as RecTarget, targetId: rec.target_id, title: rec.title, image: rec.image_path, message: null, createdAt: ms(rec.created_at), shown: 'pending', reply: null });
        }
    }
    return out;
}

/** Cuántas recibidas sin responder (el número NEUTRO del grupo; el rojo sigue siendo de amistad). */
export async function unansweredCount(me: string): Promise<number> {
    return (await listReceived(me)).filter(isUnanswered).length;
}

/**
 * Etiqueta «Recomendada por Ana» de `/mislistas/pendientes`: los títulos que añadiste a Pendientes
 * DESDE una recomendación. `movie:550` → { name, more }.
 */
export async function recommendedByMap(me: string): Promise<Map<string, { name: string; more: number }>> {
    const db = supabaseAdmin();
    const { data: rcs, error } = await db.from('recommendation_recipients').select('rec_id').eq('to_id', me).eq('status', 'added').limit(500);
    if (error) throw new Error(error.message);
    if (!rcs?.length) return new Map();
    const { data: recs, error: e2 } = await db.from('recommendations').select('from_id, target_type, target_id, created_at')
        .in('id', rcs.map((r) => r.rec_id)).order('created_at', { ascending: false });
    if (e2) throw new Error(e2.message);
    const blocked = await blockedWith(me);
    const rows = (recs ?? []).filter((r) => !blocked.has(r.from_id));
    const people = await getPeople(rows.map((r) => r.from_id));
    const byTitle = new Map<string, string[]>();
    for (const r of rows) {
        const k = key(r.target_type, r.target_id);
        const name = people.get(r.from_id)?.name;
        if (!name) continue;
        const list = byTitle.get(k) ?? [];
        if (!list.includes(name)) list.push(name);
        byTitle.set(k, list);
    }
    return new Map([...byTitle].map(([k, names]) => [k, { name: names[0], more: names.length - 1 }]));
}

/** Bloque «Te la recomendó Ana» de la ficha: quién (sin descartadas) y el mensaje más reciente. */
export async function recommendedForTitle(me: string, type: 'movie' | 'tv', id: number): Promise<{ people: PersonCard[]; message: string | null; at: number } | null> {
    const db = supabaseAdmin();
    const { data: recs, error } = await db.from('recommendations').select('id, from_id, message, created_at')
        .eq('target_type', type).eq('target_id', id).order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    if (!recs?.length) return null;
    const { data: rcs, error: e2 } = await db.from('recommendation_recipients').select('rec_id, status')
        .eq('to_id', me).in('rec_id', recs.map((r) => r.id)).neq('status', 'discarded');
    if (e2) throw new Error(e2.message);
    if (!rcs?.length) return null;
    const blocked = await blockedWith(me);
    const mine = recs.filter((r) => rcs.some((c) => c.rec_id === r.id) && !blocked.has(r.from_id));
    if (!mine.length) return null;
    const ids = [...new Set(mine.map((r) => r.from_id))];
    const people = await getPeople(ids);
    const latest = mine[0];
    return {
        people: ids.map((i) => people.get(i)).filter((p): p is PersonCard => Boolean(p)),
        message: mine.find((r) => r.message)?.message ?? null,
        at: ms(latest.created_at),
    };
}
