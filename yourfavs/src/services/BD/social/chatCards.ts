/**
 * Tarjetas del chat (Mensajes M4; handoff docs/Mensajes/design_handoff_m4/README.md §2.2).
 *
 *   · `titleCardRef`  → la copia de TMDB que se guarda con el mensaje al compartir un título.
 *   · `resolveCards`  → el estado de cada tarjeta PARA QUIEN MIRA, al pintar: el suyo («La viste ·
 *     ★ 8,5», «Vas por T2 E3», «La tienes pendiente») y el de sus amigos de la conversación.
 *
 * Las reglas de privacidad (solo amigos, sin bloqueo, perfil encendido, sin títulos ocultos) viven
 * en `msg_card_states` (migración `20261028090000_messages_cards.sql`), que reutiliza el filtro de
 * «Amigos que la han visto». Aquí solo se ordena y se calcula el siguiente episodio con TMDB.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getTitleSummaries, titleKey } from '../../API/shared/titleSummaries';
import { recViewsForNotifs } from './recommendations';
import type { CardPerson, CardViewer, ChatMessage, RecCard, SpoilerRef, TitleCard, TitleCardRef } from '../../../lib/social/types';

/** La copia de TMDB para una tarjeta nueva. null si TMDB no conoce el título. */
export async function titleCardRef(mediaType: 'movie' | 'tv', tmdbId: number): Promise<TitleCardRef | null> {
    const s = (await getTitleSummaries([{ media_type: mediaType, tmdb_id: tmdbId }])).get(titleKey({ media_type: mediaType, tmdb_id: tmdbId }));
    if (!s) return null;
    const ref: TitleCardRef = { mediaType, tmdbId, title: s.title };
    if (s.poster_path) ref.poster = s.poster_path;
    if (s.year) ref.year = s.year;
    if (s.runtime) ref.runtime = s.runtime;
    if (s.seasons) ref.seasons = s.seasons;
    return ref;
}

/**
 * `card` tal como llega en el cuerpo de una petición (`{ type: 'title', mediaType, tmdbId }`) →
 * la copia de TMDB, o `false` si no es válida o TMDB no conoce el título.
 */
export async function readTitleCard(v: unknown): Promise<TitleCardRef | false> {
    const c = v as { type?: unknown; mediaType?: unknown; tmdbId?: unknown } | null;
    if (!c || c.type !== 'title' || (c.mediaType !== 'movie' && c.mediaType !== 'tv')) return false;
    const id = Number(c.tmdbId);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 999_999_999) return false;
    return (await titleCardRef(c.mediaType, id)) ?? false;
}

interface StateRow {
    media_type: 'movie' | 'tv'; tmdb_id: number; user_id: string; state: 'seen' | 'watching' | 'pending';
    score: number | string | null; season: number | null; episode: number | null;
}

const RANK: Record<CardPerson['state'], number> = { seen: 3, watching: 2, pending: 1 };

/** El siguiente episodio tras el último visto, con los episodios de cada temporada de TMDB. */
function nextEpisode(last: { season: number; episode: number }, eps: Record<number, number> | null) {
    if (!eps) return { season: last.season, episode: last.episode + 1, upToDate: false };
    if (last.episode < (eps[last.season] ?? 0)) return { season: last.season, episode: last.episode + 1, upToDate: false };
    if ((eps[last.season + 1] ?? 0) > 0) return { season: last.season + 1, episode: 1, upToDate: false };
    return { season: last.season, episode: last.episode, upToDate: true };
}

/**
 * Rellena el estado de las tarjetas de estos mensajes (llegan de la base solo con `ref`) para `me`.
 * `others`: las demás personas de la conversación (en un 1:1, a quién se envió la recomendación).
 */
export async function resolveCards(me: string, conv: number, msgs: ChatMessage[], others: string[] = []): Promise<void> {
    await Promise.all([resolveTitleCards(me, conv, msgs), resolveRecCards(me, msgs, others)]);
}

/**
 * Recomendaciones (M4b): el estado de F4 para quien mira. Quien la recibió, el suyo completo
 * (también «Ya la tenías» / «Ya la viste»); quien la envió, solo «Enviada» o «La añadió…»
 * (descartada o abierta se ven «Enviada»). Sin el destinatario en la base: se pinta sin tarjeta.
 */
async function resolveRecCards(me: string, msgs: ChatMessage[], others: string[]): Promise<void> {
    const recs = msgs.filter((m): m is ChatMessage & { card: RecCard } => m.card?.type === 'rec');
    if (!recs.length) return;
    const inIds = recs.filter((m) => m.card.dir === 'in').map((m) => m.card.ref.recId);
    const outIds = recs.filter((m) => m.card.dir === 'out').map((m) => m.card.ref.recId);
    const [views, sent] = await Promise.all([
        inIds.length ? recViewsForNotifs(me, inIds, []) : null,
        outIds.length && others.length
            ? supabaseAdmin().from('recommendation_recipients').select('rec_id, status').in('rec_id', outIds).in('to_id', others)
            : null,
    ]);
    if (sent?.error) throw new Error(sent.error.message);
    const outStatus = new Map((sent?.data ?? []).map((r) => [r.rec_id, r.status]));
    for (const m of recs) {
        const card = m.card;
        const msg: ChatMessage = m;
        if (card.dir === 'in') {
            const v = views?.received.get(card.ref.recId);
            if (v) card.state = v.shown; else msg.card = null;
        } else {
            const st = outStatus.get(card.ref.recId);
            if (!st) msg.card = null;
            else card.state = st === 'added' ? 'added' : st === 'alerts' ? 'alerts' : 'sent';
        }
    }
}

async function resolveTitleCards(me: string, conv: number, msgs: ChatMessage[]): Promise<void> {
    const titled = msgs.filter((m): m is ChatMessage & { card: TitleCard } => m.card?.type === 'title');
    // Spoilers bloqueados (M4c): tu estado con ese título, para el pie del escudo.
    const locked = msgs.filter((m) => m.locked && m.spoiler);
    if (!titled.length && !locked.length) return;
    const refs = [
        ...titled.map((m) => ({ t: m.card.ref.mediaType, id: m.card.ref.tmdbId })),
        ...locked.map((m) => ({ t: m.spoiler!.mediaType, id: m.spoiler!.tmdbId })),
    ];
    const { data, error } = await supabaseAdmin().rpc('msg_card_states', { p_me: me, p_conv: conv, p_refs: refs });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as StateRow[];

    const mine = new Map<string, StateRow>();
    const people = new Map<string, CardPerson[]>();
    for (const r of rows) {
        const k = `${r.media_type}:${r.tmdb_id}`;
        if (r.user_id === me) { mine.set(k, r); continue; }
        const list = people.get(k) ?? [];
        list.push({ id: r.user_id, state: r.state, score: r.score == null ? null : Number(r.score) });
        people.set(k, list);
    }
    // Episodios por temporada, solo de las series que estás viendo con un episodio conocido.
    const watching = [...mine.values()].filter((r) => r.state === 'watching' && r.media_type === 'tv' && r.season != null);
    const summaries = watching.length
        ? await getTitleSummaries(watching.map((r) => ({ media_type: 'tv' as const, tmdb_id: r.tmdb_id })))
        : new Map();

    const viewerOf = (r: StateRow | undefined): CardViewer | null => {
        if (!r) return null;
        if (r.state === 'seen') return { state: 'seen', score: r.score == null ? null : Number(r.score) };
        if (r.state === 'pending') return { state: 'pending' };
        if (r.season == null || r.episode == null) return { state: 'progress', season: null, episode: null, upToDate: false };
        const eps = summaries.get(titleKey({ media_type: 'tv', tmdb_id: r.tmdb_id }))?.seasonEpisodes ?? null;
        return { state: 'progress', ...nextEpisode({ season: r.season, episode: r.episode }, eps) };
    };

    for (const m of titled) {
        const ref = m.card.ref;
        const k = `${ref.mediaType}:${ref.tmdbId}`;
        const list = [...(people.get(k) ?? [])].sort((a, b) =>
            RANK[b.state] - RANK[a.state] || (b.score ?? -1) - (a.score ?? -1));
        m.card = { type: 'title', ref, viewer: viewerOf(mine.get(k)), people: list };
    }
    for (const m of locked) m.spoilerViewer = viewerOf(mine.get(`${m.spoiler!.mediaType}:${m.spoiler!.tmdbId}`));
}

// -------------------------------------------------------------------------------------
// Spoilers (M4c, handoff M4 §3.3)
// -------------------------------------------------------------------------------------

/**
 * `spoiler` tal como llega en el cuerpo de una petición → limpio, o `false` si no es válido.
 * La base vuelve a comprobarlo (`msg_send`).
 */
export function readSpoiler(v: unknown): SpoilerRef | false {
    const s = v as Partial<Record<keyof SpoilerRef, unknown>> | null;
    if (!s || (s.mediaType !== 'movie' && s.mediaType !== 'tv')) return false;
    const id = Number(s.tmdbId);
    const title = typeof s.title === 'string' ? s.title.trim().slice(0, 300) : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !title) return false;
    const out: SpoilerRef = { mediaType: s.mediaType, tmdbId: id, title };
    if (s.season != null || s.episode != null) {
        const season = Number(s.season), episode = Number(s.episode);
        if (s.mediaType !== 'tv' || !Number.isInteger(season) || !Number.isInteger(episode) || season < 1 || episode < 1) return false;
        out.season = season;
        out.episode = episode;
    }
    return out;
}

/** Un título para el selector de spoiler. */
export interface PickTitle { type: 'movie' | 'tv'; id: number; title: string; sub: string; image: string | null }

/**
 * Sugerencias sin escribir: «En esta conversación» (tarjetas y spoilers de los últimos 50 mensajes)
 * y «Lo que estás viendo» (tus series en Siguiendo y pelis en Viendo). null si no estás en ella.
 */
export async function spoilerSuggest(me: string, conv: number): Promise<{ inChat: PickTitle[]; watching: PickTitle[] } | null> {
    const db = supabaseAdmin();
    const { data: member, error: e0 } = await db.from('conversation_members').select('joined_at')
        .eq('conv_id', conv).eq('user_id', me).is('left_at', null).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!member) return null;
    const [msgs, lib] = await Promise.all([
        db.from('messages').select('card_type, card_ref, spoiler').eq('conv_id', conv).is('deleted_at', null)
            .gte('created_at', member.joined_at).or('card_type.not.is.null,spoiler.not.is.null')
            .order('id', { ascending: false }).limit(50),
        db.from('library_items').select('tmdb_id, media_type').eq('user_id', me)
            .in('collection', ['SeriesSiguiendo', 'MoviesViendo']).order('added_at', { ascending: false }).limit(6),
    ]);
    if (msgs.error) throw new Error(msgs.error.message);
    if (lib.error) throw new Error(lib.error.message);

    const seen = new Set<string>();
    const inChat: PickTitle[] = [];
    const push = (t: PickTitle) => {
        const k = `${t.type}:${t.id}`;
        if (seen.has(k) || inChat.length >= 5) return;
        seen.add(k);
        inChat.push(t);
    };
    for (const m of msgs.data ?? []) {
        const ref = m.card_ref as Record<string, any> | null;
        if (m.card_type === 'title' && ref) push({ type: ref.mediaType, id: ref.tmdbId, title: ref.title, sub: '', image: ref.poster ?? null });
        if (m.card_type === 'rec' && ref && (ref.targetType === 'movie' || ref.targetType === 'tv')) {
            push({ type: ref.targetType, id: ref.targetId, title: ref.title, sub: '', image: ref.image ?? null });
        }
        const sp = m.spoiler as SpoilerRef | null;
        if (sp) push({ type: sp.mediaType, id: sp.tmdbId, title: sp.title, sub: '', image: null });
    }
    const refs = (lib.data ?? []).map((r) => ({ media_type: r.media_type as 'movie' | 'tv', tmdb_id: r.tmdb_id }));
    const sums = await getTitleSummaries([...refs, ...inChat.filter((t) => !t.image).map((t) => ({ media_type: t.type, tmdb_id: t.id }))]);
    for (const t of inChat) {
        const s = sums.get(titleKey({ media_type: t.type, tmdb_id: t.id }));
        if (s) { t.image ??= s.poster_path; t.sub = s.year ?? ''; }
    }
    const watching: PickTitle[] = [];
    for (const r of refs) {
        const s = sums.get(titleKey(r));
        if (s && !seen.has(`${r.media_type}:${r.tmdb_id}`)) {
            watching.push({ type: r.media_type, id: r.tmdb_id, title: s.title, sub: s.year ?? '', image: s.poster_path });
        }
    }
    return { inChat, watching };
}

/** Temporadas de una serie (episodios de cada una, de TMDB) y el último episodio que has visto. */
export async function seriesEpisodes(me: string, id: number): Promise<{ seasons: Record<number, number>; last: { season: number; episode: number } | null }> {
    const [sums, log] = await Promise.all([
        getTitleSummaries([{ media_type: 'tv', tmdb_id: id }]),
        supabaseAdmin().from('watch_log').select('season, episode').eq('user_id', me).eq('media_type', 'tv').eq('tmdb_id', id)
            .gt('season', 0).not('episode', 'is', null)
            .order('season', { ascending: false }).order('episode', { ascending: false }).limit(1),
    ]);
    if (log.error) throw new Error(log.error.message);
    const l = log.data?.[0];
    return {
        seasons: sums.get(titleKey({ media_type: 'tv', tmdb_id: id }))?.seasonEpisodes ?? {},
        last: l && l.season != null && l.episode != null ? { season: l.season, episode: l.episode } : null,
    };
}
