/**
 * Claves de las cachés de «Para ti» (`personalRecommendations.ts`) y de los gustos por género
 * (`genrePreferences.ts`), y de qué cambios de la biblioteca dependen.
 *
 * Viven aparte, sin dependencias de ningún tema, porque las necesitan también quienes las vacían
 * (`services/library/libraryChanges.ts`): la copia COMPARTIDA (Netlify Blobs, entre instancias del
 * servidor) se borra por su clave aunque la instancia que recibe el cambio no haya cargado estos módulos.
 */
import { appDateParts } from '../../utils/core/appTime';
import type { LibraryTopic } from '../library/libraryChanges';

// v7: cupo de semillas por señal; v6: semillas = favs + me gusta + onboarding + notas ≥ 8 + vistas
// recientes, con recencia; v5 exclusión = todas las listas
const GENRE_PREFS_BLOB = 'genrePrefs_v7';
// v13: `rows` para las filas por motivo; v12: 2 huecos principales para señales que no sean favorito y
// peso mínimo en variedad; v11: variedad al 70 % y tope por semilla en el resultado; v10: más señales,
// cuota de variedad y rotación diaria; v9 _recSeedTitle
const PERSONAL_RECS_BLOB = 'personalRecs_v13';

/** Lo que leen los gustos (y, a través de ellos, «Para ti»): tus listas, tus notas, tus colecciones y el onboarding. */
export const RECS_TOPICS: LibraryTopic[] = ['lists', 'ratings', 'customLists', 'taste'];

/** Gustos por género: la memoria va por usuario y la copia compartida, por clave. */
export function genrePrefsBlobKey(uidKey: string): string {
    return `${GENRE_PREFS_BLOB}:${uidKey}`;
}

/** «Para ti» rota cada día: memoria y copia compartida van por usuario y día (hora de Madrid). */
export function personalRecsKeys(uidKey: string, now: number = Date.now()): { l1Key: string; blobKey: string } {
    const l1Key = `${uidKey}:${appDateParts(now).key}`;
    return { l1Key, blobKey: `${PERSONAL_RECS_BLOB}:${l1Key}` };
}
