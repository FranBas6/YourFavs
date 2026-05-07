import { collection, getDocs, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../utils/firebaseConfig';

const COLLECTION = 'MediaTags';

export interface MediaTagsDoc {
    id: string;                 // "movie_550" | "tv_1399"
    media_type: 'movie' | 'tv';
    tmdb_id: string;
    tags: string[];
    notes: string;
    updated_at: string;         // ISO
}

const docIdFor = (mediaType: 'movie' | 'tv', tmdbId: string | number) => `${mediaType}_${tmdbId}`;

export function normalizeTag(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, 32);
}

export function parseTagsInput(raw: string): string[] {
    if (!raw) return [];
    const parts = raw.split(/[,\n]/).map(normalizeTag).filter(Boolean);
    return Array.from(new Set(parts)).slice(0, 20); // máximo 20 tags por media
}

export async function getMediaTags(
    mediaType: 'movie' | 'tv',
    tmdbId: string | number
): Promise<MediaTagsDoc | null> {
    const snap = await getDoc(doc(db, COLLECTION, docIdFor(mediaType, tmdbId)));
    return snap.exists() ? (snap.data() as MediaTagsDoc) : null;
}

/** Lee todos los docs de tags para una lista de items. Devuelve mapa `${type}_${id}` → doc. */
export async function getMediaTagsBatch(
    items: { mediaType: 'movie' | 'tv'; tmdbId: string | number }[]
): Promise<Record<string, MediaTagsDoc>> {
    if (items.length === 0) return {};
    const snaps = await Promise.all(
        items.map(it => getDoc(doc(db, COLLECTION, docIdFor(it.mediaType, it.tmdbId))))
    );
    const map: Record<string, MediaTagsDoc> = {};
    for (let i = 0; i < snaps.length; i++) {
        if (snaps[i].exists()) {
            const data = snaps[i].data() as MediaTagsDoc;
            map[data.id] = data;
        }
    }
    return map;
}

/** Lee TODOS los docs de tags (para construir lista de tags únicos en filtro). */
export async function getAllMediaTags(): Promise<MediaTagsDoc[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(d => d.data() as MediaTagsDoc);
}

export async function setMediaTags(
    mediaType: 'movie' | 'tv',
    tmdbId: string | number,
    payload: { tags?: string[]; notes?: string }
): Promise<void> {
    const id = docIdFor(mediaType, tmdbId);
    const tags = payload.tags ? payload.tags.map(normalizeTag).filter(Boolean) : undefined;
    const notes = payload.notes !== undefined ? payload.notes.trim().slice(0, 2000) : undefined;

    // Si todo queda vacío, borra el doc para no dejar basura
    if ((tags === undefined || tags.length === 0) && (notes === undefined || notes === '')) {
        const existing = await getDoc(doc(db, COLLECTION, id));
        if (existing.exists()) {
            const data = existing.data() as MediaTagsDoc;
            const newTags = tags ?? data.tags ?? [];
            const newNotes = notes ?? data.notes ?? '';
            if (newTags.length === 0 && newNotes === '') {
                await deleteDoc(doc(db, COLLECTION, id));
                return;
            }
        }
    }

    const existing = await getDoc(doc(db, COLLECTION, id));
    const existingData = existing.exists() ? (existing.data() as MediaTagsDoc) : null;

    const finalDoc: MediaTagsDoc = {
        id,
        media_type: mediaType,
        tmdb_id: String(tmdbId),
        tags: tags !== undefined ? Array.from(new Set(tags)) : existingData?.tags || [],
        notes: notes !== undefined ? notes : existingData?.notes || '',
        updated_at: new Date().toISOString(),
    };

    await setDoc(doc(db, COLLECTION, id), finalDoc);
}

export async function handleMediaTagsAction(formData: FormData): Promise<string> {
    const mediaType = formData.get('media_type') as 'movie' | 'tv';
    const tmdbId = String(formData.get('tmdb_id') || '');
    if (!mediaType || !tmdbId) throw new Error('media_type y tmdb_id requeridos');

    const tagsRaw = formData.get('tags');
    const notesRaw = formData.get('notes');
    const payload: { tags?: string[]; notes?: string } = {};
    if (tagsRaw !== null) payload.tags = parseTagsInput(String(tagsRaw));
    if (notesRaw !== null) payload.notes = String(notesRaw);

    await setMediaTags(mediaType, tmdbId, payload);
    return mediaType === 'movie' ? `/movie/${tmdbId}` : `/serie/${tmdbId}`;
}
