/**
 * POST /api/taste/save — guarda los gustos del onboarding (Fase F).
 *
 * Body JSON: { genres:number[], titles:TasteTitle[], people:TastePerson[] }.
 * Valida mín/máx en servidor (red de seguridad; el wizard ya lo aplica):
 *   géneros 3..10 · títulos 3..10 · personas 0 ó 3..10 (paso opcional).
 * Persiste en users/{uid}/taste/current y marca onboarding='done' en el perfil.
 */
import type { APIRoute } from 'astro';
import { setUserTaste, type TasteTitle, type TastePerson } from '../../../services/BD/profile/userTaste';
import { setUserProfile } from '../../../services/BD/profile/userProfile';

export const prerender = false;

const MIN = 3, MAX = 10;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ ok: false, error: 'No autorizado' }, 401);

    try {
        const body = await request.json().catch(() => ({}));
        const genresRaw = Array.isArray(body.genres) ? body.genres : [];
        const titlesRaw = Array.isArray(body.titles) ? body.titles : [];
        const peopleRaw = Array.isArray(body.people) ? body.people : [];

        // Sanea + dedup
        const genres = Array.from(new Set(
            genresRaw.map((g: unknown) => Number(g)).filter((g: number) => Number.isFinite(g))
        )).slice(0, MAX);

        const seenT = new Set<string>();
        const titles: TasteTitle[] = titlesRaw
            .filter((t: any) => t && (t.media_type === 'movie' || t.media_type === 'tv') && Number.isFinite(Number(t.id)))
            .map((t: any): TasteTitle => ({
                id: Number(t.id),
                media_type: t.media_type,
                title: String(t.title || '').slice(0, 120),
                poster_path: t.poster_path ? String(t.poster_path) : null,
            }))
            .filter((t: TasteTitle) => { const k = `${t.media_type}:${t.id}`; if (seenT.has(k)) return false; seenT.add(k); return true; })
            .slice(0, MAX);

        const seenP = new Set<number>();
        const people: TastePerson[] = peopleRaw
            .filter((p: any) => p && Number.isFinite(Number(p.id)))
            .map((p: any): TastePerson => ({
                id: Number(p.id),
                name: String(p.name || '').slice(0, 120),
                profile_path: p.profile_path ? String(p.profile_path) : null,
            }))
            .filter((p: TastePerson) => { if (seenP.has(p.id)) return false; seenP.add(p.id); return true; })
            .slice(0, MAX);

        // Validación de mínimos (personas es opcional: 0 vale)
        if (genres.length < MIN) return json({ ok: false, error: 'Elige al menos 3 géneros' }, 400);
        if (titles.length < MIN) return json({ ok: false, error: 'Marca al menos 3 títulos' }, 400);
        if (people.length > 0 && people.length < MIN) return json({ ok: false, error: 'Si añades actores, elige al menos 3 (o ninguno)' }, 400);

        await setUserTaste({ genres, titles, people });
        await setUserProfile({ onboarding: 'done' });

        // Los gustos alimentan el motor → invalidar las cachés (de este uid) para
        // que "Para ti" refleje los cambios ya en la siguiente carga.
        try {
            const [{ invalidateGenrePreferencesCache }, { invalidatePersonalRecsCache }] = await Promise.all([
                import('../../../utils/genrePreferences'),
                import('../../../utils/personalRecommendations'),
            ]);
            invalidateGenrePreferencesCache();
            invalidatePersonalRecsCache();
        } catch { /* la caché caduca sola igualmente */ }

        return json({ ok: true });
    } catch (err) {
        console.error('[api/taste/save] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudieron guardar tus gustos.' }, 500);
    }
};
