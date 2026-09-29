/**
 * POST /api/profile/avatar-upload — sube la foto de avatar del usuario.
 *
 * El cliente recorta/redimensiona la imagen (256×256 JPEG, ~30-50 KB) y la envía
 * como multipart/form-data (campo `avatar`). Va al bucket privado `avatars` de Supabase
 * Storage, en `{authId}/avatar` (la política del bucket solo deja escribir en la carpeta
 * propia). El perfil guarda la URL de nuestro endpoint que la sirve
 * (/api/profile/avatar/{authId}). Antes era base64 dentro de un documento de Firestore,
 * porque Firebase Storage exigía el plan de pago.
 */
import type { APIRoute } from 'astro';
import { setUserProfile } from '../../../services/BD/profile/userProfile';

export const prerender = false;

// La imagen recortada pesa decenas de KB; este tope es solo una red de seguridad (el bucket
// admite hasta 2 MB).
const MAX_BYTES = 700 * 1024;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);

    try {
        const form = await request.formData();
        const file = form.get('avatar');
        if (!(file instanceof File)) return json({ ok: false, error: 'Falta la imagen' }, 400);
        if (!file.type.startsWith('image/')) return json({ ok: false, error: 'El archivo no es una imagen' }, 415);
        if (file.size > MAX_BYTES) return json({ ok: false, error: 'La imagen es demasiado grande' }, 413);

        const buffer = Buffer.from(await file.arrayBuffer());
        const authId = locals.user.authId;

        const { error } = await locals.supabase.storage.from('avatars')
            .upload(`${authId}/avatar`, buffer, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;

        // El perfil guarda solo la URL de nuestro endpoint (+ cache-bust).
        const url = `/api/profile/avatar/${authId}?v=${Date.now()}`;
        await setUserProfile({ avatar_url: url });

        return json({ ok: true, url });
    } catch (err) {
        console.error('[api/profile/avatar-upload] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo subir la imagen.' }, 500);
    }
};
