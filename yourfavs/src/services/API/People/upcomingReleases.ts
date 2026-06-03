import { tmdbFetch } from '../shared/tmdbClient';
import { processBatch } from '../../../utils/processBatch';
import { getAllFollowedPeople } from '../../BD/people/yourfavsPeople';

/**
 * Estrenos futuros de las personas que sigues (handoff v2 §③).
 * Por cada persona seguida: /person/{id}/combined_credits → títulos (cast+crew)
 * con fecha de estreno futura. El evento es EL TÍTULO, atribuido a la persona
 * ("porque sigues a X"). Dedup por título: si dos personas seguidas comparten
 * estreno, gana la primera. Caché en memoria 6h (créditos cambian poco).
 */
export interface PersonUpcoming {
    person_id: string;
    person_name: string;
    tmdb_id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    release_date: string;     // YYYY-MM-DD futura
}

const TTL_MS = 6 * 60 * 60 * 1000;
let memCache: { data: PersonUpcoming[]; expires: number } | null = null;

export function invalidateUpcomingPeopleCache() { memCache = null; }

export async function getUpcomingFromFollowedPeople(): Promise<PersonUpcoming[]> {
    const now = Date.now();
    if (memCache && memCache.expires > now) return memCache.data;

    const people = await getAllFollowedPeople();
    if (!people.length) {
        memCache = { data: [], expires: now + TTL_MS };
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

    // Dedup por título (varias personas seguidas pueden compartir estreno)
    const seen = new Set<string>();
    const all: PersonUpcoming[] = [];
    for (const list of perPerson) {
        for (const u of list || []) {
            const key = `${u.media_type}_${u.tmdb_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(u);
        }
    }
    all.sort((a, b) => a.release_date.localeCompare(b.release_date));

    memCache = { data: all, expires: now + TTL_MS };
    return all;
}
