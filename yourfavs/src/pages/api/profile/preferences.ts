/**
 * PATCH (o POST) /api/profile/preferences — guarda preferencias sueltas sin recargar.
 *
 * Body JSON PARCIAL: solo los campos presentes se escriben. Es lo que usa el autoguardado
 * del panel de Ajustes (un campo por petición) y, desde antes, el menú de cuenta del header
 * (región/tema) — por eso se conserva `POST` como alias de `PATCH`.
 *
 * Todo pasa por LISTA BLANCA: un campo que no esté aquí se ignora en silencio, y los valores
 * se validan contra las constantes reales (países soportados, idiomas, provider_ids). El
 * documento `users/{uid}` lo lee el middleware en CADA request, así que no entra nada que no
 * esté declarado en `UserProfile`.
 */
import type { APIRoute } from 'astro';
import { setUserProfile, type UserProfile } from '../../../services/BD/profile/userProfile';
import { sanitizePlatformIds } from '../../../services/API/shared/watchProviders';
import { CONTENT_LANGUAGE_CODES } from '../../../utils/constants/languages';
import { SUPPORTED_COUNTRIES } from '../../../services/API/shared/tmdbInfoService';

export const prerender = false;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Claves de la campana. Ausente en el body = no se toca; presente = booleano. */
const NOTIF_KEYS = ['episodes', 'releases', 'anniversary', 'platform', 'streak', 'social'] as const;

/** Maestro + desglose del modo sin spoilers. `hide*` = true significa TAPAR. */
const SPOILER_KEYS = ['enabled', 'hideStills', 'hideSynopsis', 'hideCalendarTitles'] as const;

/**
 * Construye el patch a partir del body. Devuelve también si tocó la campana, porque en ese
 * caso hay que re-materializar las notificaciones con las nuevas preferencias.
 */
function buildPatch(body: Record<string, unknown>): { patch: Partial<UserProfile>; touchedNotifs: boolean } {
    const patch: Partial<UserProfile> = {};
    let touchedNotifs = false;

    if (typeof body.display_name === 'string') {
        // Vacío es válido: significa "vuelve al nombre de Google" (el middleware solo usa
        // display_name si tiene valor). Nunca `undefined` — Firestore lo rechaza.
        patch.display_name = body.display_name.trim().slice(0, 60);
    }

    if (typeof body.region === 'string' && SUPPORTED_COUNTRIES.some((c) => c.code === body.region)) {
        patch.region = body.region;
    }

    if (typeof body.language === 'string' && CONTENT_LANGUAGE_CODES.has(body.language)) {
        patch.language = body.language;
    }

    if (body.theme === 'light' || body.theme === 'dark' || body.theme === 'system') {
        patch.theme = body.theme;
    }

    if (body.avatar_url === null || typeof body.avatar_url === 'string') {
        const url = typeof body.avatar_url === 'string' ? body.avatar_url.trim() : '';
        patch.avatar_url = url || null;
    }

    if (Array.isArray(body.platforms)) {
        // [] es un estado válido (= no sé dónde puedes ver), así que se escribe tal cual.
        // Ya no se filtra contra una lista fija de 7: el usuario puede añadir cualquier
        // plataforma del catálogo de su región (ver `watchProviders.ts`).
        patch.platforms = sanitizePlatformIds(body.platforms);
    }

    if (typeof body.platformsFilterDefault === 'boolean') {
        patch.platformsFilterDefault = body.platformsFilterDefault;
    }

    // Mensajes M5c: «Incluir mis planes» en el calendario .ics.
    if (typeof body.icsPlans === 'boolean') {
        patch.icsPlans = body.icsPlans;
    }

    if (body.notifPrefs && typeof body.notifPrefs === 'object' && !Array.isArray(body.notifPrefs)) {
        const src = body.notifPrefs as Record<string, unknown>;
        const prefs: Record<string, boolean> = {};
        for (const k of NOTIF_KEYS) {
            if (typeof src[k] === 'boolean') prefs[k] = src[k] as boolean;
        }
        if (Object.keys(prefs).length > 0) {
            // Se puede mandar un solo toggle sin borrar los demás: `set(..., {merge: true})`
            // hace merge RECURSIVO de los mapas anidados, así que las claves ausentes se
            // quedan como estaban. (Con `update()` haría falta notación de puntos.)
            patch.notifPrefs = prefs;
            touchedNotifs = true;
        }
    }

    if (body.spoilers && typeof body.spoilers === 'object' && !Array.isArray(body.spoilers)) {
        const src = body.spoilers as Record<string, unknown>;
        const out: Record<string, boolean> = {};
        for (const k of SPOILER_KEYS) {
            if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
        }
        // Solo se escribe `spoilers`: el booleano antiguo `spoilerFree` ya no lo lee nadie
        // salvo `resolveSpoilerSettings`, como reserva para perfiles que nunca han tocado
        // este ajuste. Duplicar el valor solo daría dos verdades que pueden discrepar.
        if (Object.keys(out).length > 0) patch.spoilers = out;
    }

    return { patch, touchedNotifs };
}

const handler: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);
    try {
        const body = await request.json().catch(() => ({}));
        const { patch, touchedNotifs } = buildPatch(body as Record<string, unknown>);

        if (Object.keys(patch).length === 0) return json({ ok: false, error: 'Nada que guardar' }, 400);
        await setUserProfile(patch);

        if (touchedNotifs) {
            try {
                const { invalidateNotifSync } = await import('../../../services/API/notifications/generator');
                invalidateNotifSync();
            } catch { /* se re-sincroniza igual al día siguiente */ }
        }

        return json({ ok: true });
    } catch (err) {
        console.error('[api/profile/preferences] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudo guardar' }, 500);
    }
};

export const PATCH = handler;
export const POST = handler;   // lo usa el menú de cuenta del header desde la Fase E
