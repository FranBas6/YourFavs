import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';
import { getAllFollowedPeople } from '../../BD/people/yourfavsPeople';
import { getCurrentUid } from '../../BD/shared/userScope';

/**
 * Estrenos futuros de las personas que sigues (handoff v2 §③).
 * Por cada persona seguida: /person/{id}/combined_credits → títulos (cast+crew)
 * con fecha de estreno futura. El evento es EL TÍTULO, atribuido a la persona
 * ("porque sigues a X"). Dedup por título: si dos personas seguidas comparten
 * estreno, gana la primera. Caché en memoria 6h (créditos cambian poco).
 */
export interface PersonUpcoming {
    person_id: string;
    person_name: string;       // primera persona seguida (compat / atribución principal)
    person_names: string[];    // TODAS las personas seguidas que salen en este título
    tmdb_id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    release_date: string;     // YYYY-MM-DD futura
}

const TTL_MS = 6 * 60 * 60 * 1000;
// Caché POR USUARIO: con multiusuario una caché global filtraría los estrenos
// de las personas que sigue un usuario a otro. Clave = uid de la sesión.
const memCache = new Map<string, { data: PersonUpcoming[]; expires: number }>();

export function invalidateUpcomingPeopleCache() {
    const uid = getCurrentUid();
    if (uid) memCache.delete(uid); else memCache.clear();
}

export async function getUpcomingFromFollowedPeople(): Promise<PersonUpcoming[]> {
    const uid = getCurrentUid();
    if (!uid) return []; // invitado: no sigue a nadie

    const now = Date.now();
    const cached = memCache.get(uid);
    if (cached && cached.expires > now) return cached.data;

    const people = await getAllFollowedPeople();
    if (!people.length) {
        memCache.set(uid, { data: [], expires: now + TTL_MS });
        return [];
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    const perPerson = await processBatch(people, async (person) => {
        try {
            const credits = await tmdbFetch<any>(`/person/${person.id}/combined_credits`);
            const out: PersonUpcoming[] = [];
            for (const c of [...(credits?.cast || []), ...(credits?.crew || [])]) {
                const date: string | undefined = c.media_type === 'movie' ? c.release_date : c.first_air_date;
                if (!date || date <= today) continue;
                out.push({
                    person_id: person.id,
                    person_name: person.name,
                    person_names: [person.name],
                    tmdb_id: String(c.id),
                    media_type: c.media_type === 'movie' ? 'movie' : 'tv',
                    title: c.media_type === 'movie' ? c.title : c.name,
                    poster_path: c.poster_path ?? null,
                    release_date: date,
                });
            }
            return out;
        } catch {
            return [] as PersonUpcoming[]; // una persona caída no tumba el resto
        }
    }, 8);

    // Agrupar por título: varias personas seguidas pueden compartir un estreno.
    // En vez de quedarnos con la primera, acumulamos TODAS (para distinguir
    // "sigues a X y N más" de "sigues solo a X" y priorizar en el calendario).
    const byTitle = new Map<string, PersonUpcoming>();
    for (const list of perPerson) {
        for (const u of list || []) {
            const key = `${u.media_type}_${u.tmdb_id}`;
            const existing = byTitle.get(key);
            if (existing) {
                if (!existing.person_names.includes(u.person_name)) existing.person_names.push(u.person_name);
            } else {
                byTitle.set(key, { ...u, person_names: [...u.person_names] });
            }
        }
    }
    const all = [...byTitle.values()];
    all.sort((a, b) => a.release_date.localeCompare(b.release_date));

    memCache.set(uid, { data: all, expires: now + TTL_MS });
    return all;
}
