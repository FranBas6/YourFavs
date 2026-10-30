/**
 * La dirección secreta del calendario .ics de cada persona (Mensajes M5c; handoff M5 §3.8).
 *
 * `profiles.ics_token` (43 caracteres base62) se crea al pedirla por primera vez; «Crear una
 * nueva» la cambia y la anterior deja de funcionar al momento. Las reglas viven en
 * `20261103090000_ics_tokens.sql`. Solo se le enseña a su dueño.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';

const db = () => supabaseAdmin();

/** Ruta del feed de una dirección. */
export const icsPath = (token: string) => `/api/calendar/u/${token}.ics`;

/** Tu dirección (la crea si aún no la tienes). null si no hay perfil. */
export async function getIcsToken(me: string): Promise<string | null> {
    const { data, error } = await db().rpc('ics_token_get', { p_me: me });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
}

/** «Crear una nueva»: devuelve la dirección nueva. */
export async function rotateIcsToken(me: string): Promise<string> {
    const { data, error } = await db().rpc('ics_token_rotate', { p_me: me });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Sin perfil');
    return data as string;
}

/** De quién es una dirección y si quiere sus planes en ella. null si no existe. */
export async function icsOwner(token: string): Promise<{ userId: string; plans: boolean } | null> {
    const { data, error } = await db().rpc('ics_owner', { p_token: token });
    if (error) throw new Error(error.message);
    const row = (data as { user_id: string; plans: boolean }[] | null)?.[0];
    return row ? { userId: row.user_id, plans: row.plans } : null;
}
