/**
 * Scope de usuario para la capa BD (Fase C) — AsyncLocalStorage.
 *
 * El middleware mete en un store por petición (`runWithUser`) el usuario de la sesión
 * verificada y el cliente de Supabase con sus cookies. Las funciones de `services/BD/**`
 * leen ambos de aquí sin cambiar sus firmas.
 *
 * Regla de oro: el usuario SIEMPRE viene de la sesión (cookie verificada), NUNCA del
 * cliente. Por eso vive en el store que rellena el middleware, no en params. Y la RLS de
 * Postgres lo vuelve a comprobar en cada consulta.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseServer } from '../../../lib/supabase/server';

interface RequestContext {
    uid: string | null;
    language: string;   // idioma de contenido TMDB (perfil) — default es-ES
    region: string;     // región de streaming (perfil) — default ES
    /** Cliente de Supabase de la petición (con la sesión de sus cookies; anónimo si invitado). */
    db: SupabaseServer | null;
    /** Id de Supabase Auth del usuario (dueño de las filas en Postgres). */
    authId: string | null;
    /** Solo en `astro dev`: llamadas a TMDB de esta petición (C0, `lib/dev/tmdbMeter.ts`). */
    tmdbCalls?: string[];
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

/** Solo dev (C0): abre la lista de llamadas a TMDB de esta petición y la devuelve. */
export function startTmdbMeter(): string[] | null {
    const s = als.getStore();
    if (!s) return null;
    s.tmdbCalls = [];
    return s.tmdbCalls;
}

/** Solo dev (C0): anota una llamada a TMDB en la petición en curso (si hay medidor abierto). */
export function recordTmdbCall(call: string): void {
    als.getStore()?.tmdbCalls?.push(call);
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
