import { getStore, type Store } from '@netlify/blobs';

// Cache L2 compartido entre instancias de Lambda (Netlify Blobs).
// Sobrevive a cold starts de Netlify Functions: cuando una Lambda fría
// no tiene el cache L1 (`let cache` en módulo), L2 lo provee en ~50-100ms
// en vez de pagar 10-15s recalculando.
//
// Graceful: si Blobs no está disponible (e.g. `astro dev` sin `netlify dev`),
// todas las operaciones devuelven null/no-op y se cae al comportamiento sin L2.

let storeInstance: Store | null = null;
let storeAttempted = false;

function getStoreSafe(): Store | null {
    if (storeAttempted) return storeInstance;
    storeAttempted = true;
    try {
        storeInstance = getStore({ name: 'recs-cache', consistency: 'eventual' });
    } catch (err) {
        console.warn('[recsBlobCache] Netlify Blobs no disponible:', (err as Error).message);
        storeInstance = null;
    }
    return storeInstance;
}

interface CachedEntry<T> {
    data: T;
    expires: number;
}

export async function getCached<T>(key: string): Promise<T | null> {
    const store = getStoreSafe();
    if (!store) return null;
    try {
        const entry = (await store.get(key, { type: 'json' })) as CachedEntry<T> | null;
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            store.delete(key).catch(() => {});
            return null;
        }
        return entry.data;
    } catch (err) {
        console.warn(`[recsBlobCache] read ${key} falló:`, (err as Error).message);
        return null;
    }
}

export async function setCached<T>(key: string, data: T, ttlMs: number): Promise<void> {
    const store = getStoreSafe();
    if (!store) return;
    try {
        const entry: CachedEntry<T> = { data, expires: Date.now() + ttlMs };
        await store.setJSON(key, entry);
    } catch (err) {
        console.warn(`[recsBlobCache] write ${key} falló:`, (err as Error).message);
    }
}

export async function invalidateCached(key: string): Promise<void> {
    const store = getStoreSafe();
    if (!store) return;
    try {
        await store.delete(key);
    } catch (err) {
        console.warn(`[recsBlobCache] delete ${key} falló:`, (err as Error).message);
    }
}
