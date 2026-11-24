/**
 * POST /api/auth/login   { email, password }
 *
 * Entra con email y contraseña. Supabase deja la sesión en cookies `httpOnly` (ver
 * `services/db/server.ts`); a partir de ahí el middleware reconoce al usuario en cada request.
 */
import type { APIRoute } from 'astro';
import { json, mapAuthError, setSessionFlag } from '../../../services/db/authHttp';
import { THROTTLE, TOO_MANY, clientIp, isBlocked, hit, clear, keys } from '../../../services/db/authThrottle';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, clientAddress }) => {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return json({ ok: false, error: 'Rellena email y contraseña.' }, 400);

    // Límite de intentos (QA 5.2, H71): solo cuentan los fallos, por IP y por email.
    const ipKey = keys.ip('login', clientIp(request, () => clientAddress));
    const mailKey = keys.email('login', email);
    const [ipBlocked, mailBlocked] = await Promise.all([isBlocked(ipKey, THROTTLE.loginIp), isBlocked(mailKey, THROTTLE.loginEmail)]);
    if (ipBlocked || mailBlocked) return json({ ok: false, code: 'too_many', error: TOO_MANY }, 429);

    const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
    // `code` para dos casos que el modal trata aparte: `email_not_confirmed` (pasa a «Confirma tu email»
    // con reenviar) e `invalid_credentials` (conserva el email, vacía la contraseña y le da el foco; 7.4).
    // `user_not_found` sale como `invalid_credentials`: no se dice si el email existe.
    if (error) {
        const code = error.code === 'email_not_confirmed' ? error.code
            : (error.code === 'invalid_credentials' || error.code === 'user_not_found') ? 'invalid_credentials'
            : undefined;
        if (code === 'invalid_credentials') await Promise.all([hit(ipKey, THROTTLE.loginIp), hit(mailKey, THROTTLE.loginEmail)]);
        return json({ ok: false, error: mapAuthError(error.code), code }, 401);
    }

    await clear(mailKey); // entró bien: el email vuelve a empezar de cero
    setSessionFlag(cookies);
    return json({ ok: true });
};
