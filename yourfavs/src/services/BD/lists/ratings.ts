import { userDoc, getCurrentUid } from "../shared/userScope";

/**
 * 4.2 · Colección ligera de valoraciones: users/{uid}/Ratings/{media_type}_{tmdb_id}.
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

const docId = (mediaType: RatingMediaType, tmdbId: string | number) => `${mediaType}_${tmdbId}`;

/**
 * Crea o actualiza la nota. Primera vez → created_at = updated_at = ahora.
 * Edición → solo mueve updated_at (created_at se conserva → "actualizada").
 */
export async function setRating(mediaType: RatingMediaType, tmdbId: string | number, score: number): Promise<void> {
    if (!getCurrentUid()) return;
    const ref = userDoc('Ratings', docId(mediaType, tmdbId));
    const snap = await ref.get();
    const now = new Date();
    if (snap.exists) {
        await ref.update({ score, updated_at: now });
    } else {
        await ref.set({
            media_type: mediaType,
            tmdb_id: String(tmdbId),
            score,
            created_at: now,
            updated_at: now,
        });
    }
}

/** Borra la nota (cuando el usuario elimina su valoración). */
export async function deleteRating(mediaType: RatingMediaType, tmdbId: string | number): Promise<void> {
    if (!getCurrentUid()) return;
    await userDoc('Ratings', docId(mediaType, tmdbId)).delete();
}
