/**
 * POST /api/taste/save — guarda los gustos del onboarding (Fase F.7).
 *
 * Body JSON: { genres:number[] (IDs de cine), titles:TasteTitle[], people:TastePerson[] }.
 * Los géneros se parten en cine/TV con `splitGenreIds`. Valida mín/máx en
 * servidor (red de seguridad; el wizard ya lo aplica):
 *   géneros ≥3 · pelis 0 ó 3..10 · series 0 ó 3..10 · personas 0 ó 3..10.
 * Persiste en users/{uid}/taste/current y marca onboarding='done' en el perfil.
 */
import type { APIRoute } from 'astro';
import { setUserTaste, type TasteTitle, type TastePerson } from '../../../services/BD/profile/userTaste';
import { setUserProfile } from '../../../services/BD/profile/userProfile';
import { splitGenreIds } from '../../../utils/constants/tasteGenres';

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

        // Sanea + dedup los géneros (IDs de cine elegidos) y pártelos en cine/TV.
        const selectedGenres = Array.from(new Set(
            genresRaw.map((g: unknown) => Number(g)).filter((g: number) => Number.isFinite(g))
        )).slice(0, MAX);
        const { movieGenres, tvGenres } = splitGenreIds(selectedGenres);

        const seenT = new Set<string>();
        const cleanTitles: TasteTitle[] = titlesRaw
            .filter((t: any) => t && (t.media_type === 'movie' || t.media_type === 'tv') && Number.isFinite(Number(t.id)))
            .map((t: any): TasteTitle => ({
                id: Number(t.id),
                media_type: t.media_type,
                title: String(t.title || '').slice(0, 120),
                poster_path: t.poster_path ? String(t.poster_path) : null,
            }))
            .filter((t: TasteTitle) => { const k = `${t.media_type}:${t.id}`; if (seenT.has(k)) return false; seenT.add(k); return true; });
        // Cap por tipo (cada lista máx 10) y recombina.
        const movieTitles = cleanTitles.filter((t) => t.media_type === 'movie').slice(0, MAX);
        const tvTitles = cleanTitles.filter((t) => t.media_type === 'tv').slice(0, MAX);
        const titles: TasteTitle[] = [...movieTitles, ...tvTitles];

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

        // Validación: géneros requeridos (≥3); pelis/series/personas opcionales (0 ó ≥3).
        if (movieGenres.length < MIN) return json({ ok: false, error: 'Elige al menos 3 géneros' }, 400);
        if (movieTitles.length > 0 && movieTitles.length < MIN) return json({ ok: false, error: 'Si añades películas, elige al menos 3 (o ninguna)' }, 400);
        if (tvTitles.length > 0 && tvTitles.length < MIN) return json({ ok: false, error: 'Si añades series, elige al menos 3 (o ninguna)' }, 400);
        if (people.length > 0 && people.length < MIN) return json({ ok: false, error: 'Si añades actores, elige al menos 3 (o ninguno)' }, 400);

        await setUserTaste({ movieGenres, tvGenres, titles, people });
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
