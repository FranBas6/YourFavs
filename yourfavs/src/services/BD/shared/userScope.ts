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
import type { SupabaseServer } from '../../../lib/supabase/server';

interface RequestContext {
    uid: string | null;
    language: string;   // idioma de contenido TMDB (perfil) — default es-ES
    region: string;     // región de streaming (perfil) — default ES
    /** Cliente de Supabase de la petición (con la sesión de sus cookies; anónimo si invitado). */
    db: SupabaseServer | null;
    /** Id de Supabase Auth del usuario (dueño de las filas en Postgres). */
    authId: string | null;
}

const als = new AsyncLocalStorage<RequestContext>();

/** Lo invoca el middleware una vez por request, envolviendo a `next()`. */
export function runWithUser<T>(
    uid: string | null,
    fn: () => T,
    auth: { db: SupabaseServer; authId: string | null } | null = null,
): T {
    return als.run({ uid, language: 'es-ES', region: 'ES', db: auth?.db ?? null, authId: auth?.authId ?? null }, fn);
}

// ---------------------------------------------------------------------------------------
// Supabase (Fase 4). Las funciones de services/BD/** ya migradas usan esto en vez de
// userCol/userDoc. La RLS de Postgres ya limita cada consulta a las filas del usuario de la
// sesión; aun así se filtra por `user_id` explícitamente, para que la consulta diga lo que hace.
// ---------------------------------------------------------------------------------------

/** Cliente de Supabase de la petición actual. Lanza fuera de una petición. */
export function db(): SupabaseServer {
    const client = als.getStore()?.db;
    if (!client) throw new Error('[userScope] Consulta a Supabase fuera de una petición');
    return client;
}

/** Id de Supabase del usuario en sesión, o null (invitado). */
export function getAuthId(): string | null {
    return als.getStore()?.authId ?? null;
}

/** Id de Supabase obligatorio (escrituras). Lanza si no hay sesión. */
export function requireAuthId(): string {
    const id = getAuthId();
    if (!id) throw new Error('[userScope] Operación de datos sin usuario en sesión');
    return id;
}

/**
 * Lee TODAS las filas de una consulta, de 1000 en 1000.
 *
 * La API de Supabase corta cada respuesta en `max_rows` (1000 por defecto, en local y en la
 * nube) SIN avisar: un `select` sobre tus 2.000 episodios devolvería 1.000 y nadie se daría
 * cuenta. Cualquier lectura de "todo lo del usuario" pasa por aquí. La consulta tiene que
 * llevar un `order` estable, o las páginas podrían solaparse.
 */
export async function fetchAll<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    pageSize = 1000,
): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await page(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        out.push(...(data ?? []));
        if (!data || data.length < pageSize) return out;
    }
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

/**
 * Documento GLOBAL, fuera de `users/{uid}` y por tanto **sin `requireUid()`**.
 *
 * Es la excepción a la regla de que todo vive bajo el usuario, y hace falta para las filas de la
 * portada que se precalculan una vez para todo el mundo (los pilotos, el ranking semanal): son datos
 * públicos de TMDB, iguales para cualquiera, y **la portada también la ven invitados**, que no tienen
 * uid. Calcularlas por usuario sería pagar cien llamadas a TMDB por cada visitante.
 *
 * Ojo: `firestore.rules` deniega todo lo que esté fuera de `users/{uid}` a propósito (se migró para
 * quitar las colecciones globales antiguas). El Admin SDK se salta las reglas, así que estos
 * documentos se leen y escriben **solo en servidor**: nada de leerlos desde el cliente.
 */
export function globalDoc(collection: string, id: string): DocumentReference {
    return adminDb.collection(collection).doc(id);
}
