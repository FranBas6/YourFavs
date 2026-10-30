/**
 * GET /api/u/{handle}/avatar — la foto del perfil público, para cualquiera que pueda verlo.
 *
 * La ruta privada `/api/profile/avatar/{uid}` lleva el uid en la URL; esta usa el handle, así que
 * la página pública no enseña el id de la cuenta. Si el perfil no existe, está apagado o el
 * visitante no puede verlo: 404 (la página pinta la inicial).
 *
 * De dónde sale la foto, en este orden:
 *   · avatar subido (`/api/profile/avatar/{uid}` → bucket privado, con la clave secreta);
 *   · un póster o perfil de TMDB elegido como avatar, o la foto de Google: se sirven a través de
 *     aquí (proxy) para no depender de que el navegador del visitante llegue a otro dominio con
 *     cookies, y con tope de tamaño.
 */
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { findPublicProfileRow, resolveAvatarSource } from '../../../../services/BD/social/publicProfile';

export const prerender = false;

const MAX_BYTES = 2 * 1024 * 1024;
const PUBLIC_CACHE = 'public, max-age=300';
const OWN_AVATAR = /^\/api\/profile\/avatar\/([0-9a-f-]{36})/i;
const ALLOWED_HOSTS = /^(image\.tmdb\.org|lh\d\.googleusercontent\.com|.*\.googleusercontent\.com)$/i;

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });

export const GET: APIRoute = async ({ params }) => {
    try {
        const row = await findPublicProfileRow(params.handle ?? '');
        if (!row) return notFound();
        // En F1 la visibilidad es «Público» o la del dueño. «Solo amigos» (F3) deja ver la cabecera a
        // cualquiera, foto incluida, para que se pueda pedir la amistad.
        const src = await resolveAvatarSource(row);
        if (!src) return notFound();

        const own = OWN_AVATAR.exec(src);
        if (own) {
            const { data, error } = await supabaseAdmin().storage.from('avatars').download(`${own[1]}/avatar`);
            if (error || !data) return notFound();
            return new Response(await data.arrayBuffer(), {
                headers: { 'Content-Type': data.type || 'image/jpeg', 'Cache-Control': PUBLIC_CACHE },
            });
        }

        let url: URL;
        try { url = new URL(src); } catch { return notFound(); }
        if (url.protocol !== 'https:' || !ALLOWED_HOSTS.test(url.hostname)) return notFound();
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) return notFound();
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) return notFound();
        return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': PUBLIC_CACHE } });
    } catch (err) {
        console.error('[api/u/{handle}/avatar]', (err as Error).message);
        return notFound();
    }
};
