/**
 * PATCH /api/profile/home-layout — orden y visibilidad de los bloques de la portada.
 *
 * Body: `{ layout: [{ key, hidden? }, …] }`. Es un REEMPLAZO completo del array, no un
 * merge: el orden del array *es* el orden en la Home (`index.astro` lo recorre tal cual),
 * así que no hay forma de expresar "mueve solo este" con un patch parcial.
 *
 * Va aparte de `/preferences` porque su validación es distinta: hay que rechazar claves
 * desconocidas y duplicados, o la portada intentaría pintar un bloque que no existe.
 */
import type { APIRoute } from 'astro';
import { setUserProfile } from '../../../services/BD/profile/userProfile';
import { HOME_SECTIONS } from '../../../utils/constants/homeSections';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const handler: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const raw = (body as { layout?: unknown }).layout;
        if (!Array.isArray(raw) || raw.length === 0) {
            return json({ ok: false, error: 'Falta el orden' }, 400);
        }

        const known = new Set(HOME_SECTIONS.map((s) => s.key));
        const seen = new Set<string>();
        const layout: { key: string; hidden: boolean }[] = [];

        for (const item of raw) {
            const key = typeof item === 'string' ? item : (item as { key?: unknown })?.key;
            if (typeof key !== 'string' || !known.has(key) || seen.has(key)) {
                return json({ ok: false, error: 'Orden inválido' }, 400);
            }
            seen.add(key);
            layout.push({ key, hidden: (item as { hidden?: unknown })?.hidden === true });
        }

        // Un bloque que el cliente no mandó (versión antigua de la página, o un bloque
        // añadido después) se conserva al final: `index.astro` ya completa las claves que
        // falten, pero guardarlas explícitamente evita que "desaparezcan" del ajuste.
        // Ojo con `hidden`: poner `false` a lo que el cliente no mandó ENCENDERÍA los bloques que nacen
        // apagados (`defaultHidden`) en cuanto alguien guardara desde una página vieja. Se respeta su
        // valor por defecto.
        for (const s of HOME_SECTIONS) {
            if (!seen.has(s.key)) layout.push({ key: s.key, hidden: s.defaultHidden === true });
        }

        await setUserProfile({ homeLayout: layout });
        return json({ ok: true });
    } catch (err) {
        console.error('[api/profile/home-layout] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar' }, 500);
    }
};

export const PATCH = handler;
export const POST = handler;
