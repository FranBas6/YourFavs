/**
 * Límite de intentos en entrar, registrarse, recuperar la contraseña y reenviar la confirmación (QA 5.2,
 * H71). La cuenta vive en la base de datos (`auth_throttle`, migración 20261124090000) para que valga entre
 * instancias de Netlify; la toca solo el servidor, con la clave de servicio.
 *
 * Si la base de datos falla, se deja pasar (mejor un intento de más que dejar fuera a todo el mundo).
 */
import { supabaseAdmin } from './admin';

export interface ThrottleRule {
    /** Ventana, en segundos. */
    window: number;
    /** Intentos permitidos en la ventana. */
    max: number;
}

/** Límites de cada acción (por IP y por email). Entrar solo cuenta los fallos. */
export const THROTTLE = {
    loginIp: { window: 15 * 60, max: 30 },
    loginEmail: { window: 15 * 60, max: 8 },
    registerIp: { window: 60 * 60, max: 6 },
    resetIp: { window: 60 * 60, max: 6 },
    resetEmail: { window: 60 * 60, max: 3 },
    resendIp: { window: 60 * 60, max: 6 },
    resendEmail: { window: 60 * 60, max: 3 },
} satisfies Record<string, ThrottleRule>;

export const TOO_MANY = 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';

/**
 * IP de quien pide. En Netlify, `x-nf-client-connection-ip` (la pone su borde y no se puede falsear desde
 * fuera); en local, la del socket. Sin ninguna, 'desconocida' (todas comparten cuenta, que es lo prudente).
 */
export function clientIp(request: Request, clientAddress?: () => string): string {
    const nf = request.headers.get('x-nf-client-connection-ip');
    if (nf) return nf.trim();
    try { return clientAddress?.() || 'desconocida'; } catch { return 'desconocida'; }
}

const db = () => supabaseAdmin() as any;
const emailKey = (email: string) => email.trim().toLowerCase();

export async function isBlocked(key: string, rule: ThrottleRule): Promise<boolean> {
    try {
        const { data, error } = await db().rpc('auth_throttle_blocked', { p_key: key, p_window_seconds: rule.window, p_max: rule.max });
        if (error) throw error;
        return data === true;
    } catch (e) {
        console.error('[authThrottle] blocked:', (e as Error).message);
        return false;
    }
}

/** Suma un intento. Devuelve si, con este, ya ha llegado al máximo. */
export async function hit(key: string, rule: ThrottleRule): Promise<boolean> {
    try {
        const { data, error } = await db().rpc('auth_throttle_hit', { p_key: key, p_window_seconds: rule.window });
        if (error) throw error;
        return Number(data) > rule.max;
    } catch (e) {
        console.error('[authThrottle] hit:', (e as Error).message);
        return false;
    }
}

export async function clear(key: string): Promise<void> {
    try { await db().rpc('auth_throttle_clear', { p_key: key }); } catch { /* da igual */ }
}

export const keys = {
    ip: (action: string, ip: string) => `${action}:ip:${ip}`,
    email: (action: string, email: string) => `${action}:email:${emailKey(email)}`,
};
