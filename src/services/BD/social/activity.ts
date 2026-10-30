/**
 * «Lo que ven tus amigos» en la portada (F6 de la capa social, docs/PLAN_SOCIAL.md).
 *
 * Lo que han visto en los últimos 7 días tus amigos y las personas que sigues, agrupado por título:
 * si tres personas vieron Dune, es UNA tarjeta con tres caras. Qué se enseña lo decide la función
 * SQL `social_recent_activity` (solo lo que su perfil ya enseña a quien mira); aquí se agrupa, se
 * ordena y se pone cara y póster.
 *
 * Caché L1 de 2 minutos por usuario: la portada se recarga a menudo y esto no cambia tan deprisa.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import type { PersonCard } from '../../../lib/social/types';
import { getTitleSummaries, titleKey, type TitleRef } from '../../API/shared/titleSummaries';
import { getPeople } from './graph';

export interface ActivityWho {
    person: PersonCard;
    watchedOn: string;
    /** Solo películas: su nota, si la puso. */
    score: number | null;
    /** Solo series: última temporada y cuántos episodios (nunca cuáles). */
    season: number | null;
    episodes: number;
}

export interface ActivityItem {
    media_type: 'movie' | 'tv';
    tmdb_id: number;
    title: string;
    poster_path: string | null;
    /** Quién, de lo más reciente a lo más antiguo. */
    who: ActivityWho[];
}

const DAYS = 7;
const MAX_TITLES = 16;
const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { data: ActivityItem[]; expires: number }>();

export async function recentActivity(me: string): Promise<ActivityItem[]> {
    const hit = cache.get(me);
    if (hit && hit.expires > Date.now()) return hit.data;

    const { data, error } = await supabaseAdmin().rpc('social_recent_activity', { p_me: me, p_days: DAYS });
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Agrupar por título, conservando el orden de la función (lo más reciente primero).
    const groups = new Map<string, { ref: TitleRef; rows: typeof rows }>();
    for (const r of rows) {
        const ref: TitleRef = { media_type: r.media_type, tmdb_id: r.tmdb_id };
        const k = titleKey(ref);
        const g = groups.get(k) ?? { ref, rows: [] };
        g.rows.push(r);
        groups.set(k, g);
    }
    const top = [...groups.values()].slice(0, MAX_TITLES);

    const [people, summaries] = await Promise.all([
        getPeople(top.flatMap((g) => g.rows.map((r) => r.person_id))),
        getTitleSummaries(top.map((g) => g.ref)),
    ]);

    const items: ActivityItem[] = [];
    for (const g of top) {
        const s = summaries.get(titleKey(g.ref));
        if (!s) continue;
        const who: ActivityWho[] = [];
        for (const r of g.rows) {
            const person = people.get(r.person_id);
            if (!person) continue;
            who.push({
                person, watchedOn: r.watched_on,
                score: r.score == null ? null : Number(r.score),
                season: r.season ?? null, episodes: r.episodes ?? 0,
            });
        }
        if (who.length) items.push({ media_type: g.ref.media_type, tmdb_id: g.ref.tmdb_id, title: s.title, poster_path: s.poster_path, who });
    }
    cache.set(me, { data: items, expires: Date.now() + TTL_MS });
    return items;
}
