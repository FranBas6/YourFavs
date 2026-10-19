/**
 * Relaciones entre personas: seguir y bloquear (F2 de la capa social, docs/PLAN_SOCIAL.md y el
 * handoff docs/design_handoff_social_f2_f3 §5).
 *
 * Todo con el cliente admin y con los dos uid EXPLÍCITOS (`me` sale siempre de la sesión en el
 * endpoint; `them`, del cuerpo). Las tablas `follows` y `blocks` no tienen políticas: solo este
 * módulo las toca. Las reglas que cambian datos viven en funciones SQL (migración
 * `20261020090000_social_follows.sql`) para que cada operación sea una transacción.
 *
 * Lo que sale de aquí hacia el navegador es `PersonCard` + `Relation`: nunca email, nunca «me ha
 * bloqueado». Si alguien te bloqueó, simplemente no apareces en sus cosas ni ella en las tuyas.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { NO_RELATION, type FriendsTab, type PersonCard, type PersonEntry, type Relation } from '../../../lib/social/types';
import { initialsOf, stampFor } from '../../../lib/social/ui';

export type FollowResult = 'ok' | 'self' | 'blocked' | 'not_public';

const PAGE = 30;

// -------------------------------------------------------------------------------------
// Personas
// -------------------------------------------------------------------------------------
interface PeopleRow { id: string; handle: string | null; name: string | null; has_avatar: boolean; updated_at: string; archetype: unknown }

function toCard(r: PeopleRow): PersonCard {
    // Sin nombre visible ni de la cuenta (registro por email sin nombre y sin perfil): «Alguien».
    // Nunca la parte del email: no se enseña a otros.
    const name = r.name?.trim() || 'Alguien';
    const a = r.archetype as { name?: unknown; icon?: unknown } | null;
    return {
        id: r.id,
        handle: r.handle,
        name,
        // El avatar se sirve por dirección pública (no enseña el uid); sin perfil activo, iniciales.
        avatar: r.handle && r.has_avatar ? `/api/u/${r.handle}/avatar?v=${new Date(r.updated_at).getTime() || 0}` : null,
        archetype: a && typeof a.name === 'string' && typeof a.icon === 'string' ? { name: a.name, icon: a.icon } : null,
        color: stampFor(r.id),
        initials: initialsOf(name),
    };
}

export async function getPeople(ids: string[]): Promise<Map<string, PersonCard>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const { data, error } = await supabaseAdmin().rpc('social_people', { p_ids: unique });
    if (error) throw new Error(error.message);
    return new Map(((data ?? []) as PeopleRow[]).map((r) => [r.id, toCard(r)]));
}

// -------------------------------------------------------------------------------------
// Relaciones
// -------------------------------------------------------------------------------------

/** La relación de `me` con cada uno de `ids`, en tres consultas para toda la lista. */
export async function getRelations(me: string, ids: string[]): Promise<Map<string, Relation>> {
    const unique = [...new Set(ids)].filter((id) => id !== me);
    const out = new Map<string, Relation>(unique.map((id) => [id, { ...NO_RELATION }]));
    if (!unique.length) return out;
    const db = supabaseAdmin();
    const [outF, inF, blk] = await Promise.all([
        db.from('follows').select('followee_id').eq('follower_id', me).in('followee_id', unique),
        db.from('follows').select('follower_id').eq('followee_id', me).in('follower_id', unique),
        db.from('blocks').select('blocked_id').eq('blocker_id', me).in('blocked_id', unique),
    ]);
    for (const r of [outF, inF, blk]) if (r.error) throw new Error(r.error.message);
    for (const r of outF.data ?? []) out.get(r.followee_id)!.iFollow = true;
    for (const r of inF.data ?? []) out.get(r.follower_id)!.followsMe = true;
    for (const r of blk.data ?? []) out.get(r.blocked_id)!.blockedByMe = true;
    return out;
}

export async function getRelation(me: string, them: string): Promise<Relation> {
    return (await getRelations(me, [them])).get(them) ?? { ...NO_RELATION };
}

/** ¿`them` ha bloqueado a `me`? Solo para decidir un 404: nunca se devuelve al navegador. */
export async function isBlockedBy(me: string, them: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin().from('blocks').select('blocker_id')
        .eq('blocker_id', them).eq('blocked_id', me).maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
}

// -------------------------------------------------------------------------------------
// Escrituras (cada una es una función SQL: una transacción)
// -------------------------------------------------------------------------------------
export async function follow(me: string, them: string): Promise<FollowResult> {
    const { data, error } = await supabaseAdmin().rpc('social_follow', { p_me: me, p_them: them });
    if (error) throw new Error(error.message);
    return data as FollowResult;
}

export async function unfollow(me: string, them: string): Promise<void> {
    const { error } = await supabaseAdmin().rpc('social_unfollow', { p_me: me, p_them: them });
    if (error) throw new Error(error.message);
}

export async function block(me: string, them: string): Promise<void> {
    const { error } = await supabaseAdmin().rpc('social_block', { p_me: me, p_them: them });
    if (error) throw new Error(error.message);
}

export async function unblock(me: string, them: string): Promise<void> {
    const { error } = await supabaseAdmin().from('blocks').delete().eq('blocker_id', me).eq('blocked_id', them);
    if (error) throw new Error(error.message);
}

/** ¿Existe esa cuenta? (para no aceptar uuids inventados en bloquear). */
export async function userExists(id: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin().from('profiles').select('id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
}

// -------------------------------------------------------------------------------------
// Buscar y listas del centro «Amigos»
// -------------------------------------------------------------------------------------
async function entries(me: string, rows: { id: string; at?: number }[]): Promise<PersonEntry[]> {
    const ids = rows.map((r) => r.id);
    const [people, rels] = await Promise.all([getPeople(ids), getRelations(me, ids)]);
    return rows.flatMap((r) => {
        const person = people.get(r.id);
        return person ? [{ person, rel: rels.get(r.id) ?? { ...NO_RELATION }, at: r.at }] : [];
    });
}

/** Personas por nombre o @dirección (mín. 2 caracteres). Solo perfiles activos y sin bloqueos. */
export async function searchPeople(me: string, q: string, limit = 20): Promise<PersonEntry[]> {
    const query = q.trim();
    if (query.replace(/^@/, '').length < 2) return [];
    const { data, error } = await supabaseAdmin().rpc('social_search', { p_me: me, p_q: query, p_limit: limit });
    if (error) throw new Error(error.message);
    return entries(me, ((data ?? []) as { id: string }[]).map((r) => ({ id: r.id })));
}

export interface TabPage { items: PersonEntry[]; total: number; hasMore: boolean }

const ms = (iso: string) => new Date(iso).getTime();

/** Una página (30) de una pestaña del centro. En la F2: siguiendo, seguidores y bloqueados. */
export async function listTab(me: string, tab: FriendsTab, offset = 0): Promise<TabPage> {
    const db = supabaseAdmin();
    const range: [number, number] = [offset, offset + PAGE - 1];
    let rows: { id: string; at: number }[] = [];
    let total = 0;
    if (tab === 'siguiendo') {
        const { data, error, count } = await db.from('follows').select('followee_id, created_at', { count: 'exact' })
            .eq('follower_id', me).order('created_at', { ascending: false }).range(...range);
        if (error) throw new Error(error.message);
        rows = (data ?? []).map((r) => ({ id: r.followee_id, at: ms(r.created_at) }));
        total = count ?? 0;
    } else if (tab === 'seguidores') {
        const { data, error, count } = await db.from('follows').select('follower_id, created_at', { count: 'exact' })
            .eq('followee_id', me).order('created_at', { ascending: false }).range(...range);
        if (error) throw new Error(error.message);
        rows = (data ?? []).map((r) => ({ id: r.follower_id, at: ms(r.created_at) }));
        total = count ?? 0;
    } else if (tab === 'bloqueados') {
        const { data, error, count } = await db.from('blocks').select('blocked_id, created_at', { count: 'exact' })
            .eq('blocker_id', me).order('created_at', { ascending: false }).range(...range);
        if (error) throw new Error(error.message);
        rows = (data ?? []).map((r) => ({ id: r.blocked_id, at: ms(r.created_at) }));
        total = count ?? 0;
    }
    return { items: await entries(me, rows), total, hasMore: offset + rows.length < total };
}

/** Los números de las pestañas. */
export async function tabCounts(me: string): Promise<Record<'siguiendo' | 'seguidores' | 'bloqueados', number>> {
    const db = supabaseAdmin();
    const head = { count: 'exact' as const, head: true };
    const [a, b, c] = await Promise.all([
        db.from('follows').select('followee_id', head).eq('follower_id', me),
        db.from('follows').select('follower_id', head).eq('followee_id', me),
        db.from('blocks').select('blocked_id', head).eq('blocker_id', me),
    ]);
    for (const r of [a, b, c]) if (r.error) throw new Error(r.error.message);
    return { siguiendo: a.count ?? 0, seguidores: b.count ?? 0, bloqueados: c.count ?? 0 };
}

// -------------------------------------------------------------------------------------
// Límite de escrituras: 30 por minuto y usuario (handoff §9). En memoria de la instancia: frena
// un bucle o un script, no pretende ser exacto entre instancias.
// -------------------------------------------------------------------------------------
const hits = new Map<string, number[]>();
export function allowSocialWrite(me: string, max = 30, windowMs = 60_000): boolean {
    const now = Date.now();
    const recent = (hits.get(me) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(me, recent); return false; }
    recent.push(now);
    hits.set(me, recent);
    return true;
}
