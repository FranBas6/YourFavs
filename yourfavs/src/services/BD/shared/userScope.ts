/**
 * Scope de usuario para la capa BD (Fase C) — AsyncLocalStorage.
 *
 * El middleware mete el `uid` de la sesión verificada en un store por petición
 * (`runWithUser`). Las funciones de `services/BD/**` leen ese `uid` de aquí (sin
 * cambiar sus firmas) y construyen refs del Admin SDK bajo `users/{uid}/…`.
 *
 * Regla de oro: el `uid` SIEMPRE viene de la sesión (cookie verificada), NUNCA
 * del cliente. Por eso vive en el store que rellena el middleware, no en params.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { adminDb } from '../../../utils/firebaseAdmin';
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';

interface RequestContext {
    uid: string | null;
    language: string;   // idioma de contenido TMDB (perfil) — default es-ES
    region: string;     // región de streaming (perfil) — default ES
}

const als = new AsyncLocalStorage<RequestContext>();

/** Lo invoca el middleware una vez por request, envolviendo a `next()`. */
export function runWithUser<T>(uid: string | null, fn: () => T): T {
    return als.run({ uid, language: 'es-ES', region: 'ES' }, fn);
}

/** El middleware fija idioma/región del perfil tras leerlo (mutando el store). */
export function setRequestPrefs(prefs: { language?: string | null; region?: string | null }): void {
    const s = als.getStore();
    if (!s) return;
    if (prefs.language) s.language = prefs.language;
    if (prefs.region) s.region = prefs.region;
}

/** Idioma de contenido del request (perfil) — default es-ES fuera de contexto. */
export function getCurrentLanguage(): string {
    return als.getStore()?.language ?? 'es-ES';
}

/** Región de streaming del request (perfil) — default ES fuera de contexto. */
export function getCurrentRegion(): string {
    return als.getStore()?.region ?? 'ES';
}

/** ¿Estamos dentro de un request con store? (distingue invitado de "sin contexto"). */
export function hasUserStore(): boolean {
    return als.getStore() !== undefined;
}

/** uid actual o null (invitado / sin sesión). */
export function getCurrentUid(): string | null {
    return als.getStore()?.uid ?? null;
}

/** uid obligatorio (escrituras). Lanza si no hay sesión. */
export function requireUid(): string {
    const uid = getCurrentUid();
    if (!uid) throw new Error('[userScope] Operación de datos sin usuario en sesión');
    return uid;
}

/** Colección del usuario actual: users/{uid}/{name}. Lanza si no hay sesión. */
export function userCol(name: string): CollectionReference {
    return adminDb.collection('users').doc(requireUid()).collection(name);
}

/** Documento del usuario actual: users/{uid}/{name}/{id}. */
export function userDoc(name: string, id: string): DocumentReference {
    return userCol(name).doc(id);
}

/** Documento RAÍZ del usuario: users/{uid} (perfil/preferencias). Lanza sin sesión. */
export function userRootDoc(): DocumentReference {
    return adminDb.collection('users').doc(requireUid());
}
