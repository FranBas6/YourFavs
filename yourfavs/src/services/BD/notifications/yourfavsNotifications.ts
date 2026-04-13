import { collection, getDocs, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";

const COLLECTION = 'NotificationSubs';

export interface NotificationSub {
    id: string;          // "movie_12345" o "tv_67890"
    media_type: 'movie' | 'tv';
    tmdb_id: string;
    added_at: Date;
}

export async function addNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const docId = `${mediaType}_${tmdbId}`;
    await setDoc(doc(db, COLLECTION, docId), {
        id: docId,
        media_type: mediaType,
        tmdb_id: tmdbId,
        added_at: new Date(),
    });
}

export async function removeNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<void> {
    const docId = `${mediaType}_${tmdbId}`;
    await deleteDoc(doc(db, COLLECTION, docId));
}

export async function getNotificationSub(mediaType: 'movie' | 'tv', tmdbId: string): Promise<NotificationSub | null> {
    const docId = `${mediaType}_${tmdbId}`;
    const snap = await getDoc(doc(db, COLLECTION, docId));
    return snap.exists() ? (snap.data() as NotificationSub) : null;
}

export async function getAllNotificationSubs(): Promise<NotificationSub[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(d => d.data() as NotificationSub);
}
