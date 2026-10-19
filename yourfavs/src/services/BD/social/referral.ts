/**
 * Llegar por el enlace de alguien (F2 de la capa social; handoff social F2/F3 §7.6–7.7).
 *
 * Quien visita un perfil público sin sesión se lleva la cookie `yf_ref={handle}` (30 días, la pone
 * `scripts/social/perfil.ts`). Si crea la cuenta:
 *   · sigue automáticamente a esa persona, que recibe el aviso «te sigue»;
 *   · queda apuntado en `profiles.referred_by` (la F3 lo usa para sugerir pedirle amistad).
 * La amistad NO se crea sola: necesita que la otra persona acepte.
 *
 * Con el registro por email el handle viaja en los metadatos de la cuenta (`yf_ref`), porque el
 * enlace de confirmación puede abrirse en otro dispositivo, sin la cookie.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { findPublicProfileRow } from './publicProfile';
import { follow, getPeople } from './graph';
import type { PersonCard } from '../../../lib/social/types';

export const REF_COOKIE = 'yf_ref';

/** Quien invita, si el handle es de un perfil ACTIVO; si no, null. */
export async function findInviter(rawHandle: string | null | undefined): Promise<PersonCard | null> {
    if (!rawHandle) return null;
    try {
        const row = await findPublicProfileRow(decodeURIComponent(rawHandle));
        if (!row) return null;
        return (await getPeople([row.id])).get(row.id) ?? null;
    } catch {
        return null;
    }
}

/**
 * Aplica la invitación a una cuenta NUEVA: guarda `referred_by` (solo si aún no tenía) y sigue a
 * quien invitó. Idempotente: si ya se aplicó, no hace nada. Nunca lanza: si falla, la cuenta se
 * crea igual y solo se pierde el seguimiento automático.
 */
export async function applyReferral(newUserId: string, rawHandle: string | null | undefined): Promise<void> {
    try {
        const inviter = await findInviter(rawHandle);
        if (!inviter || inviter.id === newUserId) return;
        const { data, error } = await supabaseAdmin().from('profiles')
            .update({ referred_by: inviter.id })
            .eq('id', newUserId).is('referred_by', null)
            .select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) return;
        await follow(newUserId, inviter.id);
    } catch (err) {
        console.error('[referral] no se pudo aplicar:', (err as Error).message);
    }
}
