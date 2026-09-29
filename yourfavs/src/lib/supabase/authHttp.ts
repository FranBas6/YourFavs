/**
 * Piezas comunes de las rutas de `src/pages/api/auth/` y de `/auth/callback`.
 */
import type { AstroCookies } from 'astro';

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Cookie LEGIBLE por JS y sin nada secreto: solo le dice al cliente «hay sesión». La usa el
 * gating de `AuthModal` para decidir si un POST de un invitado abre el modal. Las cookies de
 * Supabase son `httpOnly`, así que el cliente no puede mirarlas.
 * La mantiene el middleware (la pone si hay usuario y la quita si no); aquí solo se borra al
 * cerrar sesión para que el cambio sea inmediato.
 */
export const SESSION_FLAG = 'has_session';

export function setSessionFlag(cookies: AstroCookies): void {
    cookies.set(SESSION_FLAG, '1', {
        httpOnly: false,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        path: '/',
        maxAge: 400 * 24 * 60 * 60, // lo mismo que dura la cookie de Supabase; el middleware la corrige si miente
    });
}

export function clearSessionFlag(cookies: AstroCookies): void {
    cookies.delete(SESSION_FLAG, { path: '/' });
}

/** Solo rutas internas: sin esto, `?next=https://otro-sitio` sería un redirect abierto. */
export function safeNext(raw: string | null | undefined): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
    return raw;
}

/** Códigos de error de Supabase Auth → los mismos mensajes que daba la versión de Firebase. */
export function mapAuthError(code: string | undefined): string {
    switch (code) {
        case 'user_already_exists':
        case 'email_exists':
            return 'Ese email ya tiene una cuenta. Inicia sesión.';
        case 'email_address_invalid':
        case 'validation_failed':
            return 'El email no es válido.';
        case 'weak_password':
            return 'La contraseña debe tener al menos 6 caracteres.';
        case 'same_password':
            return 'La nueva contraseña tiene que ser distinta de la anterior.';
        case 'invalid_credentials':
            return 'Email o contraseña incorrectos.';
        case 'user_not_found':
            return 'No hay ninguna cuenta con ese email.';
        case 'user_banned':
            return 'Esta cuenta está deshabilitada.';
        case 'over_request_rate_limit':
        case 'over_email_send_rate_limit':
            return 'Demasiados intentos. Inténtalo de nuevo en un rato.';
        case 'session_not_found':
        case 'session_expired':
            return 'El enlace ha caducado. Pide otro desde «¿Olvidaste la contraseña?».';
        default:
            return 'Algo salió mal. Inténtalo de nuevo.';
    }
}
