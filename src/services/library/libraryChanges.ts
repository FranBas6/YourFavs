/**
 * Cambios en la biblioteca → cachés que dependen de ella.
 *
 * Varias cachés de servidor leen tu biblioteca: el snapshot de listas, el ⌘K, Tu año, el top de actores,
 * tus sagas, los gustos por género, «Para ti», el feed de Actividad y los estrenos de quien sigues. Antes
 * cada manejador (marcar una película, una serie, importar…) tenía que acordarse de vaciarlas una a una con
 * `import()` —para no crear ciclos— y la lista estaba copiada en tres sitios (y a las colecciones propias se
 * les había olvidado).
 *
 * Ahora es al revés:
 *   · cada caché se apunta AL CARGARSE con `onLibraryChange(temas, vaciar)`, diciendo de qué depende;
 *   · cada escritura de la capa de datos (library.ts, ratings.ts, watchLog.ts…) avisa con
 *     `libraryChanged(tema)` de qué ha cambiado, así que ningún manejador puede olvidarse.
 *
 * Una caché que esta instancia no ha cargado no tiene nada en memoria, así que no hace falta avisarla. La
 * excepción son las copias COMPARTIDAS de «Para ti» y los gustos (Netlify Blobs, entre instancias): esas se
 * borran aquí por su clave (`recs/recsCacheKeys.ts`), estén o no cargados sus módulos.
 *
 * Este archivo no importa ningún tema (solo infraestructura y las claves, que no importan nada), así que
 * cualquiera puede importarlo sin crear ciclos.
 */
import { getCurrentUid } from '../db/userScope';
import { invalidateCached } from '../cache/recsBlobCache';
import { RECS_TOPICS, genrePrefsBlobKey, personalRecsKeys } from '../recs/recsCacheKeys';

/** Qué ha cambiado. */
export type LibraryTopic =
    | 'lists'        // listas fijas (library_items): altas, bajas, posiciones, opinión y nota en la fila
    | 'ratings'      // tabla de notas (ratings)
    | 'customLists'  // colecciones propias
    | 'episodes'     // progreso de episodios (watched_episodes)
    | 'diary'        // diario de visionado (watch_log)
    | 'activity'     // bitácora de acciones (activity)
    | 'people'       // actores favoritos y personas seguidas
    | 'taste'        // gustos del onboarding
    | 'tags';        // etiquetas y notas propias de un título

const subscribers: { topics: Set<LibraryTopic>; clear: () => void }[] = [];

/** Una caché se apunta: `clear` vacía lo del usuario de la petición actual. */
export function onLibraryChange(topics: LibraryTopic[], clear: () => void): void {
    subscribers.push({ topics: new Set(topics), clear });
}

/** Una escritura avisa de lo que ha cambiado. Se llama DESPUÉS de escribir, con el usuario de la petición. */
export function libraryChanged(...topics: LibraryTopic[]): void {
    for (const s of subscribers) {
        if (!topics.some((t) => s.topics.has(t))) continue;
        try { s.clear(); } catch { /* una caché que falla caduca sola */ }
    }
    if (topics.some((t) => RECS_TOPICS.includes(t))) {
        const uidKey = getCurrentUid() ?? 'guest';
        invalidateCached(genrePrefsBlobKey(uidKey)).catch(() => {});
        invalidateCached(personalRecsKeys(uidKey).blobKey).catch(() => {});
    }
}
