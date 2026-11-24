/**
 * POST /api/taste/save — guarda los gustos del onboarding (Fase F.7).
 *
 * Body JSON: { genres:number[] (IDs de cine), titles:TasteTitle[], people:TastePerson[] }.
 * Los géneros se parten en cine/TV con `splitGenreIds`. Valida en servidor (red de seguridad; el wizard
 * ya lo aplica): géneros 1..10 · pelis, series y personas 0..10.
 * Persiste en `user_state` ('taste') y marca onboarding='done' en el perfil.
 *
 * Las personas del paso 4 («Sigue a quienes te interesan») se SIGUEN de verdad (QA 2.3, H16): pasan a
 * `followed_people`, como el botón «Seguir» de su ficha, y sus estrenos llegan al Radar, al Calendario
 * y a la campana. Antes solo quedaban en los gustos, que no las usaba nadie. Solo se añaden las que
 * aún no sigues (así no cambia la fecha de las de antes); quitar a alguien aquí no le deja de seguir.
 */
import type { APIRoute } from 'astro';
import { setUserTaste, type TasteTitle, type TastePerson } from '../../../services/profile/userTaste';
import { setUserProfile } from '../../../services/profile/userProfile';
import { splitGenreIds } from '../../../utils/titles/tasteGenres';
import { addFollowedPerson, getAllFollowedPeople } from '../../../services/people/followedPeople';

export const prerender = false;

// Géneros: al menos 1 (QA 2.1, H12: antes 3, y pelis/series/personas 0 o ≥3, lo que atascaba el asistente
// con 1 o 2 elegidos). El «3» queda como sugerencia en la página.
const MIN_GENRES = 1, MAX = 10;

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

        // Validación: algún género; películas, series y personas, las que sean (también 1 o 2).
        if (movieGenres.length < MIN_GENRES) return json({ ok: false, error: 'Elige al menos un género' }, 400);

        await setUserTaste({ movieGenres, tvGenres, titles, people });
        await setUserProfile({ onboarding: 'done' });

        // Seguir a las personas elegidas. Si algo falla, los gustos ya están guardados: no se bloquea el final.
        if (people.length) {
            try {
                const already = new Set((await getAllFollowedPeople()).map((p) => Number(p.id)));
                await Promise.all(people.filter((p) => !already.has(p.id))
                    .map((p) => addFollowedPerson(String(p.id), p.name, p.profile_path ?? null)));
            } catch (e) {
                console.error('[api/taste/save] seguir personas:', (e as Error).message);
            }
        }

        // Los gustos alimentan «Para ti»: setUserTaste ya avisa a sus cachés (libraryChanges.ts).

        return json({ ok: true });
    } catch (err) {
        console.error('[api/taste/save] error:', (err as Error).message);
        return json({ ok: false, error: 'No se pudieron guardar tus gustos.' }, 500);
    }
};
