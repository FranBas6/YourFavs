/**
 * «Descargar tus datos» (QA 4.3, H45): derecho a la portabilidad del RGPD (art. 20). Todo lo que has
 * guardado en YourFavs, en un JSON legible: perfil, listas, notas, diario, episodios, colecciones,
 * etiquetas, gustos, personas y sagas que sigues, avisos, y tu parte de la capa social.
 *
 * Qué NO sale, a propósito:
 *  · lo interno o secreto: `rt_key` (canal de tiempo real), `ics_token` (calendario), memorias de avisos;
 *  · los datos de otras personas: de las conversaciones, solo tus mensajes; de las recomendaciones que te
 *    mandaron, quién y qué (que ya ves en la web), no nada suyo más.
 *
 * Lee con el cliente de servidor, SIEMPRE filtrando por tu id, y por páginas (hay tablas con miles de filas).
 */
import { supabaseAdmin } from '../db/admin';

const PAGE = 1000;

type Filter = { col: string; val: string | number | (string | number)[] };

async function all(table: string, select: string, filters: Filter[], order?: string): Promise<any[]> {
    const db = supabaseAdmin() as any;
    const out: any[] = [];
    for (let from = 0; ; from += PAGE) {
        let q = db.from(table).select(select);
        for (const f of filters) q = Array.isArray(f.val) ? q.in(f.col, f.val) : q.eq(f.col, f.val);
        if (order) q = q.order(order);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
    }
    return out;
}

/** Nombre y @ público de otras personas (para que «amigos» o «te la recomendó» se entiendan). */
async function peopleNames(ids: string[]): Promise<Record<string, { nombre: string | null; usuario: string | null }>> {
    const uniq = [...new Set(ids)].filter(Boolean);
    if (!uniq.length) return {};
    const rows = await all('profiles', 'id, display_name, public_handle', [{ col: 'id', val: uniq }]);
    return Object.fromEntries(rows.map((r) => [r.id, { nombre: r.display_name ?? null, usuario: r.public_handle ?? null }]));
}

export async function buildDataExport(uid: string): Promise<Record<string, unknown>> {
    const by = (col = 'user_id'): Filter[] => [{ col, val: uid }];

    const [
        profileRows, library, ratings, watchLog, episodes, tags, lists, listItems, actorFavs, people, sagas,
        notifSubs, spoilerPrefs, hidden, activity, notifications, imports, taste,
        follows, friendshipsA, friendshipsB, requestsOut, requestsIn, blocks,
        recsSent, recsIn, memberships, myMessages, plans, rsvps, reports,
    ] = await Promise.all([
        all('profiles', 'display_name, avatar_url, email, region, language, theme, onboarding, platforms, platforms_filter_default, notif_prefs, spoilers, home_layout, strip_palette, created_at, updated_at, public_handle, public_visibility, public_since, public_bio, public_four, public_sections, public_indexable, ics_plans', [{ col: 'id', val: uid }]),
        all('library_items', 'collection, media_type, tmdb_id, added_at, opinion, rating, position', by(), 'added_at'),
        all('ratings', 'media_type, tmdb_id, score, created_at, updated_at', by(), 'created_at'),
        all('watch_log', 'media_type, tmdb_id, season, episode, watched_on, rewatch, note, logged_at, source', by(), 'logged_at'),
        all('watched_episodes', 'serie_id, season, episode, watched_at', by(), 'watched_at'),
        all('media_tags', 'media_type, tmdb_id, tags, notes, updated_at', by()),
        all('custom_lists', 'id, name, description, icon, color_stamp, cover, item_count, position, is_public, created_at, updated_at', by(), 'position'),
        all('custom_list_items', 'list_id, media_type, tmdb_id, title, poster_path, position, added_at', by(), 'position'),
        all('actor_favs', 'person_id, added_at, position', by()),
        all('followed_people', 'person_id, name, profile_path, added_at', by(), 'added_at'),
        all('followed_collections', 'collection_id, name, added_at', by(), 'added_at'),
        all('notification_subs', 'media_type, tmdb_id, added_at', by()),
        all('spoiler_prefs', 'tmdb_id, spoiler_free, updated_at', by()),
        all('profile_hidden_titles', 'media_type, tmdb_id, title, hidden_at', by()),
        all('activity', 'verb, media_type, tmdb_id, logged_at, meta', by(), 'logged_at'),
        all('notifications', 'type, title, subtitle, href, created_at, read', by(), 'created_at'),
        all('import_jobs', 'source, label, totals, created_at, undone_at', by(), 'created_at'),
        all('user_state', 'data, updated_at', [...by(), { col: 'key', val: 'taste' }]),
        all('follows', 'followee_id, created_at', by('follower_id')),
        all('friendships', 'a_id, b_id, since, ended_at', by('a_id')),
        all('friendships', 'a_id, b_id, since, ended_at', by('b_id')),
        all('friend_requests', 'to_id, status, created_at, resolved_at', by('from_id')),
        all('friend_requests', 'from_id, status, created_at, resolved_at', by('to_id')),
        all('blocks', 'blocked_id, created_at', by('blocker_id')),
        all('recommendations', 'id, target_type, target_id, title, message, created_at', by('from_id'), 'created_at'),
        all('recommendation_recipients', 'rec_id, status, acted_at, reply_kind, reply_text, replied_at, watched_at', by('to_id')),
        all('conversation_members', 'conv_id, role, joined_at, left_at, muted', by()),
        all('messages', 'id, conv_id, kind, body, created_at, deleted_at, card_type, card_ref, spoiler', by('author_id'), 'created_at'),
        all('watch_plans', 'conv_id, media_type, tmdb_id, title, plan_date, plan_time, note, created_at, cancelled_at', by('created_by'), 'created_at'),
        all('watch_plan_rsvps', 'plan_id, answer, updated_at', by()),
        all('message_reports', 'message_id, reason, note, created_at', by('reporter_id')),
    ]);

    // Recomendaciones: a quién mandaste las tuyas y qué te mandaron (quién y qué).
    const sentIds = recsSent.map((r) => r.id);
    const [sentTo, recsInfo, convs] = await Promise.all([
        sentIds.length ? all('recommendation_recipients', 'rec_id, to_id, status, reply_kind, reply_text', [{ col: 'rec_id', val: sentIds }]) : Promise.resolve([]),
        recsIn.length ? all('recommendations', 'id, from_id, target_type, target_id, title, message, created_at', [{ col: 'id', val: recsIn.map((r) => r.rec_id) }]) : Promise.resolve([]),
        memberships.length ? all('conversations', 'id, kind, name, created_at', [{ col: 'id', val: memberships.map((m) => m.conv_id) }]) : Promise.resolve([]),
    ]);

    const friends = [...friendshipsA, ...friendshipsB].map((f) => ({ id: f.a_id === uid ? f.b_id : f.a_id, desde: f.since, terminada: f.ended_at }));
    const names = await peopleNames([
        ...friends.map((f) => f.id), ...follows.map((f) => f.followee_id), ...requestsOut.map((r) => r.to_id),
        ...requestsIn.map((r) => r.from_id), ...blocks.map((b) => b.blocked_id), ...sentTo.map((r) => r.to_id),
        ...recsInfo.map((r) => r.from_id),
    ]);
    const who = (id: string) => names[id] ?? { nombre: null, usuario: null };
    const recById = new Map(recsInfo.map((r) => [r.id, r]));

    return {
        _acerca: {
            servicio: 'YourFavs',
            generado: new Date().toISOString(),
            nota: 'Tus datos guardados en YourFavs. Los títulos y personas van con su id de TMDB (themoviedb.org). '
                + 'De las conversaciones solo salen tus mensajes; de otras personas, solo su nombre y su @ público.',
        },
        perfil: profileRows[0] ?? null,
        gustos: taste[0]?.data ?? null,
        listas: library,
        notas: ratings,
        diario: watchLog,
        episodios_vistos: episodes,
        etiquetas_y_notas: tags,
        colecciones: lists.map((l) => ({ ...l, titulos: listItems.filter((i) => i.list_id === l.id) })),
        actores_favoritos: actorFavs,
        personas_que_sigues: people,
        sagas_que_sigues: sagas,
        avisos_pedidos: notifSubs,
        sin_spoilers_por_serie: spoilerPrefs,
        ocultos_en_tu_perfil: hidden,
        actividad: activity,
        notificaciones: notifications,
        importaciones: imports,
        social: {
            amigos: friends.map((f) => ({ ...who(f.id), desde: f.desde, terminada: f.terminada })),
            sigues_a: follows.map((f) => ({ ...who(f.followee_id), desde: f.created_at })),
            solicitudes_enviadas: requestsOut.map((r) => ({ a: who(r.to_id), estado: r.status, fecha: r.created_at, resuelta: r.resolved_at })),
            solicitudes_recibidas: requestsIn.map((r) => ({ de: who(r.from_id), estado: r.status, fecha: r.created_at, resuelta: r.resolved_at })),
            bloqueados: blocks.map((b) => ({ ...who(b.blocked_id), desde: b.created_at })),
            recomendaciones_enviadas: recsSent.map((r) => ({
                ...r, id: undefined,
                para: sentTo.filter((t) => t.rec_id === r.id).map((t) => ({ ...who(t.to_id), estado: t.status, respuesta: t.reply_text ?? t.reply_kind ?? null })),
            })),
            recomendaciones_recibidas: recsIn.map((r) => {
                const rec = recById.get(r.rec_id);
                return { de: rec ? who(rec.from_id) : null, titulo: rec?.title ?? null, tipo: rec?.target_type ?? null, id_tmdb: rec?.target_id ?? null, mensaje: rec?.message ?? null, fecha: rec?.created_at ?? null, estado: r.status, tu_respuesta: r.reply_text ?? r.reply_kind ?? null, vista: r.watched_at };
            }),
            conversaciones: convs.map((c) => ({ ...c, tus_mensajes: myMessages.filter((m) => m.conv_id === c.id && !m.deleted_at).map(({ conv_id: _c, deleted_at: _d, ...m }) => m) })),
            planes_que_propusiste: plans,
            tus_respuestas_a_planes: rsvps,
            denuncias_que_hiciste: reports,
        },
    };
}
