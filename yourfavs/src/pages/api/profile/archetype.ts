/**
 * POST /api/profile/archetype — recalcula el arquetipo cinéfilo del usuario en sesión y lo guarda
 * en `profiles.public_archetype`, que es lo que lee su perfil público.
 *
 * El arquetipo necesita las stats de toda la biblioteca (`calculateLifetimeStats`, varios segundos
 * en frío y con la sesión del dueño), así que no se calcula al servir el perfil a un visitante. Lo
 * pide el propio perfil cuando lo abre el DUEÑO y el guardado tiene más de 7 días, en segundo plano
 * (mismo patrón que `api/home/hooks-refresh`): el visitante solo lee el resultado.
 */
import type { APIRoute } from 'astro';
import { jsonNoStore } from '../../../lib/http';
import { getOwnPublicSettings, saveOwnArchetype } from '../../../services/BD/social/publicSettings';
import { invalidatePublicProfileCache } from '../../../services/BD/social/publicProfile';

export const prerender = false;

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ locals, url }) => {
    if (!locals.user) return jsonNoStore({ ok: false, error: 'No autorizado' }, 401);
    try {
        const settings = await getOwnPublicSettings();
        const computedAt = settings.archetype?.computed_at ? new Date(settings.archetype.computed_at).getTime() : 0;
        const force = url.searchParams.get('force') === '1';
        if (!force && Date.now() - computedAt < STALE_MS) return jsonNoStore({ ok: true, fresh: true });

        const [{ calculateLifetimeStats }, { getMaxWatchStreak }, { deriveArchetype }] = await Promise.all([
            import('../../../utils/yearStats'),
            import('../../../services/BD/series/yourfavsSerie'),
            import('../../../utils/cinemaIdentity'),
        ]);
        const [stats, streak] = await Promise.all([calculateLifetimeStats(), getMaxWatchStreak()]);
        const a = deriveArchetype(stats, streak.max);
        await saveOwnArchetype({ name: a.name, icon: a.icon, description: a.description });
        invalidatePublicProfileCache(settings.handle);
        return jsonNoStore({ ok: true, fresh: false, archetype: a });
    } catch (err) {
        console.error('[api/profile/archetype]', (err as Error).message);
        return jsonNoStore({ ok: false, error: 'No se pudo calcular' }, 500);
    }
};
