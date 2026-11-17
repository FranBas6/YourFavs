/**
 * Modo de registro (capa social F2, docs/PLAN_SOCIAL.md «Llegar por el enlace de alguien»).
 *
 *   SIGNUP_MODE=open   (por defecto) cualquiera crea cuenta.
 *   SIGNUP_MODE=invite solo quien llega desde el enlace de un perfil activo (cookie `yf_ref`).
 *
 * Es un freno de mano: se cambia en el panel de Netlify sin desplegar. Entrar con una cuenta que ya
 * existe no cambia nunca.
 */
export type SignupMode = 'open' | 'invite';

export function signupMode(): SignupMode {
    const v = (import.meta.env.SIGNUP_MODE || process.env.SIGNUP_MODE || '').trim().toLowerCase();
    return v === 'invite' ? 'invite' : 'open';
}
