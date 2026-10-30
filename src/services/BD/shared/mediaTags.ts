import { db, fetchAll, getAuthId, requireAuthId } from './userScope';

// Tabla `media_tags` (antes users/{uid}/MediaTags/{type}_{id}). Hacia fuera se devuelve la
// forma de documento de siempre: `id` = "movie_550" y `tmdb_id` en texto.
interface MediaTagsRow { media_type: 'movie' | 'tv'; tmdb_id: number; tags: string[]; notes: string; updated_at: string }
const COLUMNS = 'media_type, tmdb_id, tags, notes, updated_at';
const toDoc = (r: MediaTagsRow): MediaTagsDoc => ({
    id: docIdFor(r.media_type, r.tmdb_id),
    media_type: r.media_type,
    tmdb_id: String(r.tmdb_id),
    tags: r.tags ?? [],
    notes: r.notes ?? '',
    updated_at: r.updated_at,
});

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
    const userId = getAuthId();
    if (!userId) return null;
    const { data, error } = await db().from('media_tags').select(COLUMNS)
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId)).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDoc(data as MediaTagsRow) : null;
}

/** Lee todos los docs de tags para una lista de items. Devuelve mapa `${type}_${id}` → doc. */
export async function getMediaTagsBatch(
    items: { mediaType: 'movie' | 'tv'; tmdbId: string | number }[]
): Promise<Record<string, MediaTagsDoc>> {
    const userId = getAuthId();
    if (items.length === 0 || !userId) return {};
    // Una consulta por tipo (antes: una lectura por título de la lista).
    const map: Record<string, MediaTagsDoc> = {};
    for (const mediaType of ['movie', 'tv'] as const) {
        const ids = Array.from(new Set(items.filter(it => it.mediaType === mediaType).map(it => Number(it.tmdbId)).filter(Number.isInteger)));
        for (let i = 0; i < ids.length; i += 200) {
            const { data, error } = await db().from('media_tags').select(COLUMNS)
                .eq('user_id', userId).eq('media_type', mediaType).in('tmdb_id', ids.slice(i, i + 200));
            if (error) throw new Error(error.message);
            for (const r of (data ?? []) as MediaTagsRow[]) { const d = toDoc(r); map[d.id] = d; }
        }
    }
    return map;
}

/** Lee TODOS los docs de tags (para construir lista de tags únicos en filtro). */
export async function getAllMediaTags(): Promise<MediaTagsDoc[]> {
    const userId = getAuthId();
    if (!userId) return [];
    const rows = await fetchAll<MediaTagsRow>((from, to) =>
        db().from('media_tags').select(COLUMNS).eq('user_id', userId)
            .order('media_type').order('tmdb_id').range(from, to),
    );
    return rows.map(toDoc);
}

export async function setMediaTags(
    mediaType: 'movie' | 'tv',
    tmdbId: string | number,
    payload: { tags?: string[]; notes?: string }
): Promise<void> {
    const userId = requireAuthId();
    const key = { user_id: userId, media_type: mediaType, tmdb_id: Number(tmdbId) };
    const tags = payload.tags ? payload.tags.map(normalizeTag).filter(Boolean) : undefined;
    const notes = payload.notes !== undefined ? payload.notes.trim().slice(0, 2000) : undefined;

    const existingData = await getMediaTags(mediaType, tmdbId);
    const finalTags = tags !== undefined ? Array.from(new Set(tags)) : existingData?.tags || [];
    const finalNotes = notes !== undefined ? notes : existingData?.notes || '';

    // Si todo queda vacío, borra la fila para no dejar basura
    if (finalTags.length === 0 && finalNotes === '') {
        if (existingData) {
            const { error } = await db().from('media_tags').delete()
                .eq('user_id', key.user_id).eq('media_type', key.media_type).eq('tmdb_id', key.tmdb_id);
            if (error) throw new Error(error.message);
        }
        return;
    }

    const { error } = await db().from('media_tags').upsert(
        { ...key, tags: finalTags, notes: finalNotes, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,media_type,tmdb_id' },
    );
    if (error) throw new Error(error.message);
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
