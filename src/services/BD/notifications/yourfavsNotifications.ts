import { db, fetchAll, getAuthId, requireAuthId } from "../shared/userScope";

// Tabla `notification_subs` (antes users/{uid}/NotificationSubs/{type}_{id}). Hacia fuera, la
// forma de siempre: id "movie_12345" y tmdb_id en texto.

export interface NotificationSub {
    id: string;          // "movie_12345" o "tv_67890"
    media_type: 'movie' | 'tv';
    tmdb_id: string;
    added_at: Date;
}

interface SubRow { media_type: 'movie' | 'tv'; tmdb_id: number; added_at: string }

const toSub = (r: SubRow): NotificationSub => ({
    id: `${r.media_type}_${r.tmdb_id}`,
    media_type: r.media_type,
    tmdb_id: String(r.tmdb_id),
    added_at: new Date(r.added_at),
});

export async function addNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const { error } = await db().from('notification_subs').upsert(
        { user_id: requireAuthId(), media_type: mediaType, tmdb_id: Number(tmdbId), added_at: new Date().toISOString() },
        { onConflict: 'user_id,media_type,tmdb_id' },
    );
    if (error) throw new Error(error.message);
}

export async function removeNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const { error } = await db().from('notification_subs').delete()
        .eq('user_id', requireAuthId()).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
}

export async function getNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<NotificationSub | null> {
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('notification_subs').select('media_type, tmdb_id, added_at')
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId)).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toSub(data as SubRow) : null;
}

export async function getAllNotificationSubs(): Promise<NotificationSub[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<SubRow>((from, to) =>
        db().from('notification_subs').select('media_type, tmdb_id, added_at').eq('user_id', userId)
            .order('added_at').order('tmdb_id').range(from, to),
    );
    return rows.map(toSub);
}
