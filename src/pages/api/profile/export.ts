/**
 * GET /api/profile/export — «Descargar tus datos» (QA 4.3, H45; portabilidad, art. 20 del RGPD).
 * Devuelve un JSON para guardar (`Content-Disposition: attachment`) con todo lo tuyo:
 * `services/profile/dataExport.ts` explica qué entra y qué no. Solo con sesión, y como mucho una vez
 * por minuto por usuario (lee muchas tablas: es la petición más cara de la web).
 */
import type { APIRoute } from 'astro';
import { buildDataExport } from '../../../services/profile/dataExport';

export const prerender = false;

const lastExport = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export const GET: APIRoute = async ({ locals }) => {
    const uid = locals.user?.uid;
    if (!uid) return new Response(JSON.stringify({ ok: false, error: 'Inicia sesión para descargar tus datos' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const now = Date.now();
    const prev = lastExport.get(uid) ?? 0;
    if (now - prev < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - (now - prev)) / 1000);
        return new Response(JSON.stringify({ ok: false, error: `Espera ${wait} s para volver a descargarlos` }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(wait) } });
    }
    lastExport.set(uid, now);

    try {
        const data = await buildDataExport(uid);
        const day = new Date().toISOString().slice(0, 10);
        return new Response(JSON.stringify(data, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="yourfavs-mis-datos-${day}.json"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        lastExport.delete(uid); // un fallo no cuenta para la espera
        console.error('[api/profile/export]', (err as Error).message);
        return new Response(JSON.stringify({ ok: false, error: 'No se han podido preparar tus datos. Inténtalo otra vez.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
