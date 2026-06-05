/**
 * POST /api/auth/delete-account — elimina la cuenta del usuario en sesión.
 *
 * Borra users/{uid} + TODAS sus subcolecciones (recursiveDelete) y el usuario de
 * Firebase Auth, luego limpia las cookies. El uid SIEMPRE sale de la sesión
 * verificada (locals.user), nunca del cliente. Irreversible.
 */
import type { APIRoute } from 'astro';
import { adminAuth, adminDb } from '../../../utils/firebaseAdmin';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ locals, cookies }) => {
    const user = locals.user;
    if (!user) return json({ ok: false, error: 'No autorizado' }, 401);

    try {
        // users/{uid} + todas sus subcolecciones (listas, tags, subs, episodios…)
        await adminDb.recursiveDelete(adminDb.collection('users').doc(user.uid));
        // Usuario de Firebase Auth
        await adminAuth.deleteUser(user.uid);
    } catch (err) {
        console.error('[api/auth/delete-account] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo eliminar la cuenta' }, 500);
    }

    cookies.delete('session', { path: '/' });
    cookies.delete('has_session', { path: '/' });
    return json({ ok: true }, 200);
};
