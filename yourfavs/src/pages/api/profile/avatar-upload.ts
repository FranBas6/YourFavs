/**
 * POST /api/profile/avatar-upload — sube la foto de avatar del usuario.
 *
 * El cliente recorta/redimensiona la imagen (256×256 JPEG, ~30-50 KB) y la envía
 * como multipart/form-data (campo `avatar`). La guardamos en Firestore (base64) en
 * un doc aparte `users/{uid}/media/avatar` — NO en el doc de perfil, para que las
 * lecturas de perfil del middleware sigan siendo ligeras. El perfil solo guarda la
 * URL de nuestro endpoint que la sirve (/api/profile/avatar/{uid}).
 *
 * Así funciona en plan Spark (sin Firebase Storage, que requiere Blaze) y sin coste.
 */
import type { APIRoute } from 'astro';
import { adminDb } from '../../../utils/firebaseAdmin';
import { setUserProfile } from '../../../services/BD/profile/userProfile';

export const prerender = false;

// Firestore: límite ~1 MB por documento. La imagen recortada pesa decenas de KB;
// este tope (700 KB en crudo → ~950 KB en base64) es solo una red de seguridad.
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
        const uid = locals.user.uid;

        await adminDb.collection('users').doc(uid).collection('media').doc('avatar').set({
            data: buffer.toString('base64'),
            content_type: 'image/jpeg',
            updated_at: new Date(),
        });

        // El perfil guarda solo la URL de nuestro endpoint (+ cache-bust).
        const url = `/api/profile/avatar/${uid}?v=${Date.now()}`;
        await setUserProfile({ avatar_url: url });

        return json({ ok: true, url });
    } catch (err) {
        console.error('[api/profile/avatar-upload] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo subir la imagen.' }, 500);
    }
};
