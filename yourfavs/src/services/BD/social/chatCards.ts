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
import type { CardPerson, CardViewer, ChatMessage, RecCard, TitleCard, TitleCardRef } from '../../../lib/social/types';

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
    if (!titled.length) return;
    const refs = titled.map((m) => m.card.ref);
    const { data, error } = await supabaseAdmin().rpc('msg_card_states', {
        p_me: me, p_conv: conv, p_refs: refs.map((r) => ({ t: r.mediaType, id: r.tmdbId })),
    });
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
}
