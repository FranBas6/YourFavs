/**
 * Lo que compartes con tus amigos (F5 de la capa social, docs/PLAN_SOCIAL.md):
 *
 *   · `friendsSeen`   → «Amigos que la han visto» en las fichas.
 *   · `inCommon`      → «En común contigo» en el perfil de un amigo.
 *   · `pendingCommon` → la ruleta «algo que los dos tenemos pendiente».
 *
 * Las reglas (solo amigos, sin bloqueo, perfil del amigo encendido, sin sus títulos ocultos) viven
 * en las funciones SQL de `20261023090000_social_in_common.sql`: aquí solo se ordena, se cuenta y se
 * pone cara a los ids. Cliente admin con los dos uid explícitos, como el resto de `social/`.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import type { PersonCard } from '../../../lib/social/types';
import { getTitleSummaries, titleKey, type TitleRef } from '../../API/shared/titleSummaries';
import { getPeople } from './graph';

// -------------------------------------------------------------------------------------
// «Amigos que la han visto» (ficha)
// -------------------------------------------------------------------------------------
export interface FriendSeen {
    person: PersonCard;
    /** `watching`: la está viendo (series en Siguiendo, pelis en Viendo). */
    state: 'seen' | 'watching';
    score: number | null;
}
export interface FriendsSeenView {
    seen: FriendSeen[];
    /** Amigos que la tienen en Pendientes o Ver pronto (solo se cuentan). */
    pending: number;
}

export async function friendsSeen(me: string, type: 'movie' | 'tv', id: number): Promise<FriendsSeenView | null> {
    const { data, error } = await supabaseAdmin().rpc('social_friends_seen', { p_me: me, p_type: type, p_id: id });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.length) return null;
    const watched = rows.filter((r) => r.state !== 'pending');
    const people = await getPeople(watched.map((r) => r.friend_id));
    const seen: FriendSeen[] = [];
    for (const r of watched) {
        const person = people.get(r.friend_id);
        if (person) seen.push({ person, state: r.state as FriendSeen['state'], score: r.score == null ? null : Number(r.score) });
    }
    return { seen, pending: rows.length - watched.length };
}

// -------------------------------------------------------------------------------------
// «En común contigo» (perfil de un amigo)
// -------------------------------------------------------------------------------------
export interface CommonTitle {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    mine: number | null;
    /** Nota del amigo. null si no la puso o si su perfil no enseña notas («Mejor valoradas» apagada). */
    theirs: number | null;
}
export interface CommonView {
    /** Títulos que habéis visto los dos. */
    total: number;
    /** De esos, los que habéis puntuado los dos… */
    ratedBoth: number;
    /** …y en cuántos coincidís (diferencia de medio punto como mucho). */
    same: number;
    /** Los que más os gustaron a los dos primero; como mucho `COMMON_LANE`. */
    items: CommonTitle[];
}

const COMMON_LANE = 12;
/** «Valoráis igual»: misma nota o medio punto de diferencia (la escala va de 0,5 en 0,5). */
const SAME_TASTE_GAP = 0.5;

export async function inCommon(me: string, them: string, opts: { showTheirScores: boolean }): Promise<CommonView | null> {
    const { data, error } = await supabaseAdmin().rpc('social_in_common', { p_me: me, p_them: them });
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r) => ({
        ref: { media_type: r.media_type, tmdb_id: r.tmdb_id } as TitleRef,
        mine: r.my_score == null ? null : Number(r.my_score),
        theirs: r.their_score == null ? null : Number(r.their_score),
        at: new Date(r.at).getTime() || 0,
    }));
    if (!rows.length) return null;

    const both = rows.filter((r) => r.mine != null && r.theirs != null);
    const same = both.filter((r) => Math.abs(r.mine! - r.theirs!) <= SAME_TASTE_GAP).length;

    // Primero lo que os gustó a los dos (la nota más baja de las dos, de mayor a menor), luego lo
    // que solo uno puntuó y al final el resto; dentro de cada grupo, lo más reciente.
    const rank = (r: (typeof rows)[number]) =>
        r.mine != null && r.theirs != null ? 20 + Math.min(r.mine, r.theirs) : r.mine != null || r.theirs != null ? 10 : 0;
    const top = [...rows].sort((a, b) => rank(b) - rank(a) || b.at - a.at).slice(0, COMMON_LANE);

    const summaries = await getTitleSummaries(top.map((r) => r.ref));
    const items: CommonTitle[] = [];
    for (const r of top) {
        const s = summaries.get(titleKey(r.ref));
        if (!s) continue;
        items.push({
            media_type: r.ref.media_type, tmdb_id: r.ref.tmdb_id, title: s.title, poster_path: s.poster_path,
            mine: r.mine, theirs: opts.showTheirScores ? r.theirs : null,
        });
    }
    return { total: rows.length, ratedBoth: both.length, same, items };
}

// -------------------------------------------------------------------------------------
// Ruleta con un amigo
// -------------------------------------------------------------------------------------
export async function pendingCommon(me: string, them: string): Promise<TitleRef[]> {
    const { data, error } = await supabaseAdmin().rpc('social_pending_common', { p_me: me, p_them: them });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ media_type: r.media_type, tmdb_id: r.tmdb_id }));
}

/** Amigos para los chips de la ruleta: cara y nombre, por orden alfabético. */
export async function rouletteFriends(me: string): Promise<PersonCard[]> {
    const db = supabaseAdmin();
    const [x, y] = await Promise.all([
        db.from('friendships').select('b_id').eq('a_id', me).is('ended_at', null),
        db.from('friendships').select('a_id').eq('b_id', me).is('ended_at', null),
    ]);
    if (x.error) throw new Error(x.error.message);
    if (y.error) throw new Error(y.error.message);
    const ids = [...(x.data ?? []).map((r) => r.b_id), ...(y.data ?? []).map((r) => r.a_id)];
    const people = await getPeople(ids);
    // Sin perfil activo no enseñan nada (la función SQL los deja fuera): tampoco se ofrecen.
    return [...people.values()].filter((p) => p.handle).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
