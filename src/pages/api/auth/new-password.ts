/**
 * POST /api/auth/new-password   { password }
 *
 * Pone la contraseña nueva tras entrar con el enlace del email (la sesión la abrió
 * `/auth/callback`). También vale para quien entra con Google y quiere añadir contraseña.
 */
import type { APIRoute } from 'astro';
import { PASSWORD_MIN } from '../../../utils/core/textLimits';
import { obviousPasswordReason } from '../../../utils/core/passwordCheck';
import { isPwnedPassword } from '../../../services/db/pwnedPasswords';
import { json, mapAuthError } from '../../../services/db/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: mapAuthError('session_not_found') }, 401);
    const body = await request.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < PASSWORD_MIN) return json({ ok: false, error: mapAuthError('weak_password') }, 400);
    // Obvia (repetición, secuencia, tu email) o filtrada en alguna brecha de datos (QA 4.5).
    const obvious = obviousPasswordReason(password, locals.user.email);
    if (obvious) return json({ ok: false, code: 'weak_password', error: obvious }, 400);
    if (await isPwnedPassword(password)) {
        return json({ ok: false, code: 'pwned_password', error: 'Esta contraseña ha aparecido en filtraciones de datos de otras webs. Elige otra (una frase larga funciona muy bien).' }, 400);
    }

    const { error } = await locals.supabase.auth.updateUser({ password });
    if (error) return json({ ok: false, error: mapAuthError(error.code) }, 400);
    return json({ ok: true });
};
