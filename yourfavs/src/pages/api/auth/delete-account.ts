/**
 * POST /api/auth/delete-account — elimina la cuenta del usuario en sesión. Irreversible.
 *
 * Borrar el usuario de Supabase Auth se lleva por delante todas sus filas (`on delete cascade`
 * desde `auth.users` en todas las tablas). Hace falta la clave secreta: un usuario no puede
 * borrarse a sí mismo de Auth.
 *
 * TRANSICIÓN (Fase 3 → 4): mientras los datos sigan en Firestore, se borra también su árbol
 * `users/{uid}`. En la Fase 4 esa parte desaparece.
 */
import type { APIRoute } from 'astro';
import { adminDb } from '../../../utils/firebaseAdmin';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { clearSessionFlag, json } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies }) => {
    const user = locals.user;
    if (!user) return json({ ok: false, error: 'No autorizado' }, 401);

    try {
        await adminDb.recursiveDelete(adminDb.collection('users').doc(user.uid));
        const { error } = await supabaseAdmin().auth.admin.deleteUser(user.authId);
        if (error) throw error;
    } catch (err) {
        console.error('[api/auth/delete-account] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo eliminar la cuenta' }, 500);
    }

    // La sesión ya no vale (el usuario no existe): se limpian las cookies de este navegador.
    try { await locals.supabase.auth.signOut({ scope: 'local' }); } catch { /* da igual */ }
    clearSessionFlag(cookies);
    return json({ ok: true });
};
