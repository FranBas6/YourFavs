/**
 * Estado GLOBAL de la portada en `app_state` (antes los documentos homeRows/{id} de Firestore):
 * filas que se calculan una vez para todo el mundo, invitados incluidos.
 *
 * Se lee y escribe con la clave secreta, siempre en servidor: la tabla no tiene políticas de
 * escritura, y así también funciona para invitados y fuera de una petición.
 *
 * El cerrojo sustituye a la transacción de Firestore que evitaba que dos Lambdas recalcularan a
 * la vez: `claim_app_state` es un UPDATE condicional (atómico por sí solo) que devuelve los
 * datos si te llevas el cerrojo y NULL si otra instancia lo tiene desde hace menos de `ttl`.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';

export async function readAppState<T>(key: string): Promise<T | null> {
    const { data, error } = await supabaseAdmin().from('app_state').select('data').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    const value = data?.data as unknown;
    return value && typeof value === 'object' && Object.keys(value).length ? (value as T) : null;
}

/** Datos actuales si te llevas el cerrojo; `false` si lo tiene otra instancia. */
export async function claimAppState<T>(key: string, ttlMs: number): Promise<T | null | false> {
    const { data, error } = await supabaseAdmin().rpc('claim_app_state', { p_key: key, p_ttl_ms: ttlMs });
    if (error) throw new Error(error.message);
    if (data === null) return false;
    const value = data as unknown;
    return value && typeof value === 'object' && Object.keys(value).length ? (value as T) : null;
}

/** Guarda el documento entero y suelta el cerrojo. */
export async function writeAppState(key: string, value: object): Promise<void> {
    const { error } = await supabaseAdmin().from('app_state')
        .upsert({ key, data: value as never, claimed_at: 0 }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
}

/** Suelta el cerrojo sin tocar los datos (el cálculo falló). */
export async function releaseAppState(key: string): Promise<void> {
    const { error } = await supabaseAdmin().from('app_state').update({ claimed_at: 0 }).eq('key', key);
    if (error) throw new Error(error.message);
}
