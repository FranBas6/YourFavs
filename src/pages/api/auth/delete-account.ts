/**
 * POST /api/auth/delete-account — elimina la cuenta del usuario en sesión. Irreversible.
 *
 * Borrar el usuario de Supabase Auth se lleva por delante todas sus filas (`on delete cascade`
 * desde `auth.users` en todas las tablas). Hace falta la clave secreta: un usuario no puede
 * borrarse a sí mismo de Auth. Los ficheros de Storage (avatar) se borran aparte: Storage no
 * cuelga de la FK.
 */
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { clearSessionFlag, json } from '../../../lib/supabase/authHttp';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies }) => {
    const user = locals.user;
    if (!user) return json({ ok: false, error: 'No autorizado' }, 401);

    try {
        const admin = supabaseAdmin();
        const { data: files } = await admin.storage.from('avatars').list(user.authId);
        if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.authId}/${f.name}`));
        const { error } = await admin.auth.admin.deleteUser(user.authId);
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
