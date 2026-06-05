import { userCol, userDoc, getCurrentUid } from "../shared/userScope";

const COLLECTION = 'NotificationSubs';

export interface NotificationSub {
    id: string;          // "movie_12345" o "tv_67890"
    media_type: 'movie' | 'tv';
    tmdb_id: string;
    added_at: Date;
}

export async function addNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const docId = `${mediaType}_${tmdbId}`;
    await userDoc(COLLECTION, docId).set({
        id: docId,
        media_type: mediaType,
        tmdb_id: tmdbId,
        added_at: new Date(),
    });
}

export async function removeNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const docId = `${mediaType}_${tmdbId}`;
    await userDoc(COLLECTION, docId).delete();
}

export async function getNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<NotificationSub | null> {
    if (!getCurrentUid()) return null;
    const docId = `${mediaType}_${tmdbId}`;
    const snap = await userDoc(COLLECTION, docId).get();
    return snap.exists ? (snap.data() as NotificationSub) : null;
}

export async function getAllNotificationSubs(): Promise<NotificationSub[]> {
    if (!getCurrentUid()) return [];
    const snap = await userCol(COLLECTION).get();
    return snap.docs.map(d => d.data() as NotificationSub);
}
