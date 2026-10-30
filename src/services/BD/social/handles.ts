/**
 * Handle del perfil público (`/u/{handle}`) — handoff perfil público §5 y §8.1.
 *
 * Reglas, validadas aquí en el servidor aunque el cliente ya las compruebe:
 *   · de 3 a 20 caracteres, solo `[a-z0-9_]` (se guarda en minúsculas);
 *   · no puede ser una palabra reservada (`RESERVED_HANDLES`);
 *   · único sin distinguir mayúsculas (índice `profiles_public_handle_unique`);
 *   · se cambia como mucho cada 30 días. El PRIMER handle no cuenta: no hay nada que romper.
 *
 * El handle viejo NO redirige al cambiarlo: da 404. Así nadie hereda los enlaces de otro.
 */
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { RESERVED_HANDLES } from '../../../utils/constants/reservedHandles';

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_COOLDOWN_DAYS = 30;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export type HandleProblem = 'format' | 'reserved' | 'taken' | 'cooldown';

/** Lo que escribe el usuario → lo que se guarda: minúsculas y sin espacios. */
export function normalizeHandle(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim().toLowerCase().replace(/\s+/g, '') : '';
}

/** Formato y palabras reservadas. No mira la base de datos. */
export function handleShapeProblem(handle: string): 'format' | 'reserved' | null {
    if (!HANDLE_RE.test(handle)) return 'format';
    if (RESERVED_HANDLES.has(handle)) return 'reserved';
    return null;
}

/** Fecha a partir de la cual se puede volver a cambiar, o null si ya se puede. */
export function handleCooldownUntil(changedAt: string | null | undefined, now = Date.now()): Date | null {
    if (!changedAt) return null;
    const until = new Date(changedAt).getTime() + HANDLE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return until > now ? new Date(until) : null;
}

/**
 * ¿Lo tiene OTRA cuenta? Hay que mirar perfiles ajenos, y la RLS solo deja ver el propio, así que
 * esta consulta va con la clave secreta. Solo pide el `id`: no sale ningún dato de esa cuenta.
 */
export async function isHandleTakenByOther(handle: string, ownerId: string): Promise<boolean> {
    // Igualdad exacta: el CHECK de la tabla obliga a guardar en minúsculas y aquí llega ya
    // normalizado, así que «Ana» y «ana» son el mismo valor. El índice único es sobre lower().
    const { data, error } = await supabaseAdmin()
        .from('profiles')
        .select('id')
        .eq('public_handle', handle)
        .neq('id', ownerId)
        .limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
}

/**
 * Comprobación completa para el campo de Ajustes y para el guardado.
 * `current` y `changedAt` son los del dueño: escribir su propio handle no es «ocupado».
 */
export async function checkHandle(
    raw: unknown,
    owner: { id: string; current: string | null; changedAt: string | null },
): Promise<{ ok: true; handle: string; same: boolean } | { ok: false; handle: string; reason: HandleProblem; availableFrom?: string }> {
    const handle = normalizeHandle(raw);
    const shape = handleShapeProblem(handle);
    if (shape) return { ok: false, handle, reason: shape };
    if (owner.current && owner.current.toLowerCase() === handle) return { ok: true, handle, same: true };
    // Enfriamiento: solo si ya tenía uno. El primero se elige libremente.
    if (owner.current) {
        const until = handleCooldownUntil(owner.changedAt);
        if (until) return { ok: false, handle, reason: 'cooldown', availableFrom: until.toISOString() };
    }
    if (await isHandleTakenByOther(handle, owner.id)) return { ok: false, handle, reason: 'taken' };
    return { ok: true, handle, same: false };
}
