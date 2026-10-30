/**
 * GET /api/profile/avatar/{uid} — sirve la foto de avatar subida por el usuario.
 *
 * Lee `avatars/{uid}/avatar` del bucket privado de Supabase Storage (escrito por
 * avatar-upload; `uid` es el id de Supabase Auth) y devuelve la imagen. Público a propósito:
 * se usa como `<img src>` en header y perfil, así que se lee con la clave secreta. La URL
 * lleva `?v=<timestamp>` (cache-bust), así que cacheamos agresivo.
 */
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/admin';

// Solo ids de Supabase: nada de rutas raras dentro del bucket.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
    const uid = params.uid;
    if (!uid || !UUID.test(uid)) return new Response('Not found', { status: 404 });

    try {
        const { data, error } = await supabaseAdmin().storage.from('avatars').download(`${uid}/avatar`);
        if (error || !data) return new Response('Not found', { status: 404 });

        return new Response(await data.arrayBuffer(), {
            status: 200,
            headers: {
                'Content-Type': data.type || 'image/jpeg',
                // La URL cambia (?v=) cuando se actualiza el avatar → cache largo + immutable.
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (err) {
        console.error('[api/profile/avatar/{uid}] error:', (err as Error).message);
        return new Response('Error', { status: 500 });
    }
};
