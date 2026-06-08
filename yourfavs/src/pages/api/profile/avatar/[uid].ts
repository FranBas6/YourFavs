/**
 * GET /api/profile/avatar/{uid} — sirve la foto de avatar subida por el usuario.
 *
 * Lee el doc `users/{uid}/media/avatar` (base64, escrito por avatar-upload) y
 * devuelve la imagen. Público a propósito: se usa como `<img src>` en header y
 * perfil. La URL lleva `?v=<timestamp>` (cache-bust), así que cacheamos agresivo.
 */
import type { APIRoute } from 'astro';
import { adminDb } from '../../../../utils/firebaseAdmin';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
    const uid = params.uid;
    if (!uid) return new Response('Not found', { status: 404 });

    try {
        const snap = await adminDb.collection('users').doc(uid).collection('media').doc('avatar').get();
        if (!snap.exists) return new Response('Not found', { status: 404 });

        const d = snap.data() as { data?: string; content_type?: string };
        if (!d?.data) return new Response('Not found', { status: 404 });

        const buffer = Buffer.from(d.data, 'base64');
        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': d.content_type || 'image/jpeg',
                // La URL cambia (?v=) cuando se actualiza el avatar → cache largo + immutable.
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (err) {
        console.error('[api/profile/avatar/{uid}] error:', (err as Error).message);
        return new Response('Error', { status: 500 });
    }
};
