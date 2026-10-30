/**
 * «Plan para verla» (Mensajes M5; handoff docs/Mensajes/design_handoff_m5/README.md §2.2).
 *
 * Las reglas viven en `20261101090000_messages_plans.sql` (quién puede qué, fechas en Madrid,
 * respuestas que se mantienen al cambiar, avisos solo a quien dijo «Voy»). Aquí, lo que se hace con
 * la sesión de quien actúa, como en F4:
 *   · «Voy» asegura el título en tu Ver pronto (sin quitarlo nunca: lo pusiste tú);
 *   · «Marcar como vista» es el mismo gesto que en la ficha (Vistas + pase en el diario).
 * Y devolver la tarjeta resuelta para repintarla.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getTitleSummaries, titleKey } from '../../API/shared/titleSummaries';
import { handleMovieFavAction } from '../movies/yourfavsMovie';
import { handleSerieFavAction } from '../series/yourfavsSerie';
import { saveFixed } from '../lists/fixedLists';
import { planViews, resolveCards } from './chatCards';
import { toMessage } from './messages';
import type { ChatMessage, PlanView } from '../../../lib/social/types';

const db = () => supabaseAdmin();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isPlanDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v));
export const isPlanTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v);
export const PLAN_NOTE_MAX = 80;

export interface ProposeInput {
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    date: string;
    time: string | null;
    note: string | null;
    source: PlanView['source'];
    wtw?: { of: number; have: number } | null;
}
export type ProposeResult =
    | { ok: true; planId: number; message: ChatMessage }
    | { ok: false; error: 'none' | 'read_only' | 'past_date' | 'note' | 'title' | 'rate'; }
    | { ok: false; error: 'exists'; planId: number; date: string; time: string | null };

export async function proposePlan(me: string, conv: number, i: ProposeInput): Promise<ProposeResult> {
    const s = (await getTitleSummaries([{ media_type: i.mediaType, tmdb_id: i.tmdbId }])).get(titleKey({ media_type: i.mediaType, tmdb_id: i.tmdbId }));
    if (!s) return { ok: false, error: 'title' };
    const { data, error } = await db().rpc('plan_propose', {
        p_me: me, p_conv: conv,
        p_ref: { mediaType: i.mediaType, tmdbId: i.tmdbId, title: s.title, poster: s.poster_path ?? '' },
        p_date: i.date, p_time: i.time as string, p_note: i.note ?? '', p_source: i.source,
        p_wtw_of: i.wtw?.of, p_wtw_have: i.wtw?.have,
    });
    if (error) throw new Error(error.message);
    const r = data as unknown as { ok: boolean; error?: string; plan_id?: number; date?: string; time?: string | null; message?: Parameters<typeof toMessage>[0] };
    if (!r.ok) {
        if (r.error === 'exists') return { ok: false, error: 'exists', planId: r.plan_id!, date: r.date!, time: r.time ? r.time.slice(0, 5) : null };
        return { ok: false, error: (r.error ?? 'none') as 'none' | 'read_only' | 'past_date' | 'note' | 'title' | 'rate' };
    }
    // Quien lo propone, va: también a su Ver pronto (un extra; si falla, el plan ya está).
    try { await ensureVerPronto(i.mediaType, i.tmdbId, me); } catch { /* sin Ver pronto */ }
    const message = toMessage(r.message!, me);
    await resolveCards(me, conv, [message]);
    return { ok: true, planId: r.plan_id!, message };
}

/** El plan resuelto para `me` (para devolverlo tras una acción). null si ya no lo ve. */
export async function planView(me: string, plan: number): Promise<PlanView | null> {
    return (await planViews(me, [plan])).get(plan) ?? null;
}

/** Asegura el título en tu Ver pronto (si ya está, no hace nada). */
async function ensureVerPronto(mediaType: 'movie' | 'tv', tmdbId: number, me: string): Promise<void> {
    const col = mediaType === 'movie' ? 'MoviesVerPronto' : 'SeriesVerPronto';
    const { data, error } = await db().from('library_items').select('tmdb_id').eq('user_id', me).eq('collection', col).eq('tmdb_id', tmdbId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return;
    const fd = new FormData();
    fd.set('id', String(tmdbId));
    fd.set('action', 'add');
    if (mediaType === 'movie') { fd.set('list_type', 'verPronto'); await handleMovieFavAction(fd); }
    else { fd.set('actionType', 'verpronto'); await handleSerieFavAction(fd); }
}

export type PlanError = 'none' | 'owner' | 'closed' | 'not_owner' | 'past_date' | 'note' | 'same';

/** «Voy» / «No puedo». No escribe en el chat. */
export async function rsvpPlan(me: string, plan: number, answer: 'yes' | 'no'): Promise<{ ok: true; plan: PlanView } | { ok: false; error: PlanError }> {
    const { data, error } = await db().rpc('plan_rsvp', { p_me: me, p_plan: plan, p_answer: answer });
    if (error) throw new Error(error.message);
    if (data !== 'ok') return { ok: false, error: data as PlanError };
    const v = await planView(me, plan);
    if (!v) return { ok: false, error: 'none' };
    // Ver pronto es un extra: si falla, la respuesta ya está guardada.
    if (answer === 'yes') { try { await ensureVerPronto(v.mediaType, v.tmdbId, me); } catch { /* sin Ver pronto */ } }
    return { ok: true, plan: v };
}

/** Cambiar día, hora o nota (solo quien lo propone). `time`/`note` undefined = no se tocan. */
export async function changePlan(
    me: string, plan: number, c: { date?: string; time?: string | null; note?: string | null },
): Promise<{ ok: true; plan: PlanView } | { ok: false; error: PlanError }> {
    const { data, error } = await db().rpc('plan_change', {
        // null = «sin hora» / «el mismo día» (los tipos generados no admiten null en los argumentos).
        p_me: me, p_plan: plan, p_date: (c.date ?? null) as string,
        p_time: (c.time ?? null) as string, p_set_time: c.time !== undefined,
        p_note: c.note ?? '', p_set_note: c.note !== undefined,
    });
    if (error) throw new Error(error.message);
    if (data !== 'ok') return { ok: false, error: data as PlanError };
    const v = await planView(me, plan);
    return v ? { ok: true, plan: v } : { ok: false, error: 'none' };
}

export async function cancelPlan(me: string, plan: number): Promise<{ ok: true; plan: PlanView } | { ok: false; error: PlanError }> {
    const { data, error } = await db().rpc('plan_cancel', { p_me: me, p_plan: plan });
    if (error) throw new Error(error.message);
    if (data !== 'ok') return { ok: false, error: data as PlanError };
    const v = await planView(me, plan);
    return v ? { ok: true, plan: v } : { ok: false, error: 'none' };
}

/** Un plan tuyo con «Voy», fuera del chat (Ver pronto y calendario; handoff §3.4–§3.5). */
export interface MyPlan {
    id: number;
    convId: number;
    kind: 'direct' | 'group';
    /** El nombre del grupo o, en un 1:1, el de la otra persona. */
    with: string | null;
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    title: string;
    poster: string | null;
    date: string;
    time: string | null;
    note: string | null;
    /** Cuántas personas van (contigo). */
    yes: number;
    /** «¿La visteis?» ya contestado. */
    seen: boolean;
    past: boolean;
}

/** «Van 3» · «Vais los dos» · «De momento, solo tú». Solo el número: los nombres, en el chat. */
export const planGoers = (p: MyPlan) => p.yes <= 1 ? 'De momento, solo tú' : p.kind === 'direct' && p.yes === 2 ? 'Vais los dos' : `Van ${p.yes}`;
/** «Viernes de pelis» (grupo) · «Con Ana» (1:1). */
export const planWith = (p: MyPlan) => p.kind === 'group' ? (p.with ?? 'Grupo') : `Con ${p.with ?? 'otra persona'}`;

/**
 * Tus planes con «Voy» de `from` a `to` (fechas YYYY-MM-DD de Madrid; sin `to`, sin límite), por
 * fecha y hora. `convs`: si tienes alguna conversación (para la pista de Ver pronto sin planes).
 */
export async function myPlans(me: string, from: string, to?: string): Promise<{ plans: MyPlan[]; convs: boolean }> {
    const { data, error } = await db().rpc('plan_mine', { p_me: me, p_from: from, p_to: (to ?? null) as string });
    if (error) throw new Error(error.message);
    const r = data as unknown as { plans: MyPlan[]; convs: boolean };
    return { plans: r.plans ?? [], convs: !!r.convs };
}

/**
 * El aviso «Hoy» de la campana (handoff §3.6): se crea al abrirla o al cambiar de página, sin
 * cron. La BD lo hace idempotente; aquí solo se evita preguntar más de una vez por minuto desde el
 * contador (cada cambio de página). Al abrir la campana (`force`), siempre.
 */
const todaySynced = new Map<string, number>();
export async function syncPlanToday(me: string, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - (todaySynced.get(me) ?? 0) < 60_000) return;
    todaySynced.set(me, now);
    const { error } = await db().rpc('plan_today_sync', { p_me: me });
    if (error) throw new Error(error.message);
}

/**
 * «¿La visteis?»: con `snooze` («Aún no») solo deja de preguntar. Si no, la marca como vista con
 * el mismo gesto que la ficha (películas). En series no se marca la serie entera: eso se hace por
 * episodios en la ficha.
 */
export async function seenPlan(me: string, plan: number, snooze: boolean): Promise<{ ok: true; plan: PlanView } | { ok: false; error: PlanError }> {
    const cur = await planView(me, plan);
    if (!cur) return { ok: false, error: 'none' };
    if (!snooze && cur.mediaType === 'movie') await saveFixed('movie', cur.tmdbId, 'vistas', 'add');
    const { data, error } = await db().rpc('plan_seen', { p_me: me, p_plan: plan });
    if (error) throw new Error(error.message);
    if (data !== 'ok') return { ok: false, error: 'none' };
    const v = await planView(me, plan);
    return v ? { ok: true, plan: v } : { ok: false, error: 'none' };
}
