import { db, fetchAll, getAuthId } from "../shared/userScope";

/**
 * 4.2 · Tabla ligera de valoraciones: `ratings` (clave usuario + media_type + tmdb_id).
 *
 * Por qué existe: las notas viven *inline* en cada lista (`rating:number`) y NO
 * tienen timestamp → no se puede construir un evento "Has valorado X" fiable ni
 * distinguir "valorada" de "actualizada". Esta colección guarda
 * `{score, created_at, updated_at}` con sello de tiempo, así que alimenta la
 * Actividad (4ª fuente) y queda como almacén canónico de notas.
 *
 * Best-effort desde los handlers save_rating: un fallo aquí NUNCA rompe el guardado
 * de la nota inline (que es lo que pinta la ficha).
 */

export type RatingMediaType = 'movie' | 'tv';

export interface RatingRow {
    media_type: RatingMediaType;
    tmdb_id: number;
    score: number;
    created_at: string;
    updated_at: string;
}

/**
 * Crea o actualiza la nota. Primera vez → created_at = updated_at = ahora.
 * Edición → solo mueve updated_at (created_at se conserva → "actualizada").
 */
export async function setRating(mediaType: RatingMediaType, tmdbId: string | number, score: number): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    // Upsert sin tocar created_at: si ya existía, solo cambia score (y el trigger
    // set_updated_at mueve updated_at); si no, created_at = updated_at = ahora (defaults).
    const { error } = await db().from('ratings').upsert(
        { user_id: userId, media_type: mediaType, tmdb_id: Number(tmdbId), score },
        { onConflict: 'user_id,media_type,tmdb_id', defaultToNull: false },
    );
    if (error) throw new Error(error.message);
}

/** Borra la nota (cuando el usuario elimina su valoración). */
export async function deleteRating(mediaType: RatingMediaType, tmdbId: string | number): Promise<void> {
    const userId = getAuthId();
    if (!userId) return;
    const { error } = await db().from('ratings').delete()
        .eq('user_id', userId).eq('media_type', mediaType).eq('tmdb_id', Number(tmdbId));
    if (error) throw new Error(error.message);
}

/** Todas las notas del usuario (fuente "Has valorado" de Actividad). */
export async function listRatings(): Promise<RatingRow[]> {
    const userId = getAuthId();
    if (!userId) return [];
    return fetchAll<RatingRow>((from, to) =>
        db().from('ratings').select('media_type, tmdb_id, score, created_at, updated_at')
            .eq('user_id', userId).order('created_at').order('tmdb_id').range(from, to),
    );
}
