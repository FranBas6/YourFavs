/**
 * «¿Qué vemos?» en una conversación (Mensajes M4d; handoff docs/Mensajes/design_handoff_m4 §2.3 y §3.6).
 *
 *   · `wtwRoll`: una tirada PRIVADA para quien la pide (no se guarda nada). Del bote de
 *     `msg_wtw_pool` (Pendientes de todas las personas de «Quién viene»), primero lo de las N; si no
 *     queda nada, lo mejor de N−1 (con 3 o más). Sin repetir lo ya tirado en esa sesión (`exclude`).
 *   · `wtwSend`: publica una tirada como tarjeta. El servidor vuelve a mirar el bote, así que
 *     «quién la tiene» y «de cuántos» no se pueden inventar.
 *
 * Reglas y privacidad en `20261031090000_messages_wtw.sql`; aquí, el azar, el tiempo y TMDB.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { getTitleSummaries, titleKey } from '../../API/shared/titleSummaries';
import { toMessage } from './messages';
import { resolveCards } from './chatCards';
import type { ChatMessage, WtwCardRef } from '../../../lib/social/types';

interface PoolRow { media_type: 'movie' | 'tv'; tmdb_id: number; have: string[]; of: number }

async function pool(me: string, conv: number, who: string[]): Promise<PoolRow[]> {
    const { data, error } = await supabaseAdmin().rpc('msg_wtw_pool', { p_me: me, p_conv: conv, p_who: who });
    if (error) throw new Error(error.message);
    return (data ?? []) as PoolRow[];
}

/** Una tirada. `tier`: de las N o de N−1. `restart`: ya habías visto todas y se vuelve a empezar. */
export type WtwRoll =
    | { empty: true; of: number }
    | { empty: false; roll: WtwCardRef; tier: 'all' | 'minus'; restart: boolean };

/** Cuántos candidatos se miran en TMDB por tirada (los botes grandes se muestrean al azar). */
const SAMPLE = 40;

const shuffle = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
};

export async function wtwRoll(
    me: string, conv: number, who: string[], o: { maxRuntime?: number | null; exclude?: string[] } = {},
): Promise<WtwRoll | null> {
    const rows = await pool(me, conv, who);
    const of = new Set([me, ...who]).size;
    if (!rows.length) return { empty: true, of };
    const all = rows.filter((r) => r.have.length >= r.of);
    const minus = rows.filter((r) => r.have.length < r.of);
    const seen = new Set(o.exclude ?? []);
    const key = (r: PoolRow) => `${r.media_type}:${r.tmdb_id}`;

    // Con el tiempo de la noche: las pelis por su duración; las series, por episodios, siempre caben.
    const fits = async (list: PoolRow[]) => {
        const sample = shuffle([...list]).slice(0, SAMPLE);
        const sums = await getTitleSummaries(sample.map((r) => ({ media_type: r.media_type, tmdb_id: r.tmdb_id })));
        return sample.filter((r) => {
            const s = sums.get(titleKey({ media_type: r.media_type, tmdb_id: r.tmdb_id }));
            if (!s) return false;
            return !o.maxRuntime || r.media_type === 'tv' || !s.runtime || s.runtime <= o.maxRuntime;
        }).map((r) => ({ r, s: sums.get(titleKey({ media_type: r.media_type, tmdb_id: r.tmdb_id }))! }));
    };

    for (const [tier, list] of [['all', all], ['minus', minus]] as const) {
        if (!list.length) continue;
        const ok = await fits(list);
        if (!ok.length) continue;
        const fresh = ok.filter(({ r }) => !seen.has(key(r)));
        const restart = !fresh.length;
        const { r, s } = (restart ? ok : fresh)[0];
        const roll: WtwCardRef = {
            mediaType: r.media_type, tmdbId: r.tmdb_id, title: s.title, of: r.of, have: r.have, roller: me,
            ...(s.poster_path ? { poster: s.poster_path } : {}), ...(s.year ? { year: s.year } : {}),
            ...(s.runtime ? { runtime: s.runtime } : {}), ...(s.seasons ? { seasons: s.seasons } : {}),
        };
        return { empty: false, roll, tier, restart };
    }
    return { empty: true, of };
}

export type WtwSendResult = { ok: true; message: ChatMessage } | { ok: false; error: 'gone' | 'none' | 'read_only' | 'rate' };

/** Publica en el chat una tirada (la vuelve a comprobar contra el bote). */
export async function wtwSend(me: string, conv: number, who: string[], t: { mediaType: 'movie' | 'tv'; tmdbId: number }): Promise<WtwSendResult> {
    const row = (await pool(me, conv, who)).find((r) => r.media_type === t.mediaType && r.tmdb_id === t.tmdbId);
    if (!row) return { ok: false, error: 'gone' };
    const s = (await getTitleSummaries([{ media_type: t.mediaType, tmdb_id: t.tmdbId }])).get(titleKey({ media_type: t.mediaType, tmdb_id: t.tmdbId }));
    if (!s) return { ok: false, error: 'gone' };
    const ref = {
        mediaType: t.mediaType, tmdbId: t.tmdbId, title: s.title, of: row.of, have: row.have,
        ...(s.poster_path ? { poster: s.poster_path } : {}), ...(s.year ? { year: s.year } : {}),
        ...(s.runtime ? { runtime: s.runtime } : {}), ...(s.seasons ? { seasons: s.seasons } : {}),
    };
    const { data, error } = await supabaseAdmin().rpc('msg_send_wtw', { p_me: me, p_conv: conv, p_ref: ref });
    if (error) throw new Error(error.message);
    const r = data as unknown as { ok: boolean; error?: 'none' | 'read_only' | 'rate'; message?: Parameters<typeof toMessage>[0] };
    if (!r.ok || !r.message) return { ok: false, error: r.error ?? 'none' };
    const message = toMessage(r.message, me);
    await resolveCards(me, conv, [message]);
    return { ok: true, message };
}
