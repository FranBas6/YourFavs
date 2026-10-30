export function calculateAge(birthday: string | null | undefined): number | null {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

/**
 * `character` que NO es un papel: apariciones como sí mismo (late shows, galas de premios,
 * informativos) y metraje de archivo. TMDB **no traduce** este campo — lo devuelve en inglés
 * en cualquier idioma —, así que la comparación es estable.
 */
const NON_ROLE_CHARACTER = /\b(self|himself|herself|themselves)\b|archiv/i;

/**
 * Una serie solo puede adelantar el inicio de carrera este nº de años respecto a la primera
 * película. En los créditos de TV, TMDB da el `first_air_date` de LA SERIE, no el del episodio
 * en que salió la persona: las antológicas de larguísimo recorrido ("Hallmark Hall of Fame",
 * 1951; "Saturday Night Live", 1975) arrastraban el inicio décadas atrás.
 */
const TV_LEAD_MAX_YEARS = 5;

export interface CareerCredit {
    media_type?: string;
    character?: string;
    release_date?: string;
    first_air_date?: string;
}

/**
 * Rango de años en activo a partir de `combined_credits.cast`. Nace de un dato que se leía
 * como si fuera la edad ("1952 - 2028 · 76 años" en una actriz de 41). Cuatro defensas:
 *  1. Descarta lo que no es un papel (sí mismo / archivo) → era el 100% de la basura.
 *  2. Suelo en el año de nacimiento (+4): nadie actúa antes de nacer.
 *  3. Techo en el año actual o el de fallecimiento: ni estrenos anunciados ni archivo póstumo.
 *  4. Ancla de cine para el inicio (ver TV_LEAD_MAX_YEARS).
 * Devuelve `null` si no queda ningún año utilizable (la pill no se pinta).
 */
export function getCareerRange(
    credits: CareerCredit[],
    birthday: string | null | undefined,
    deathday: string | null | undefined,
): { start: number; end: number } | null {
    const birthYear = birthday ? new Date(birthday).getFullYear() : NaN;
    const deathYear = deathday ? new Date(deathday).getFullYear() : NaN;
    const currentYear = new Date().getFullYear();
    const floor = !isNaN(birthYear) ? birthYear + 4 : 1900;
    const ceil = !isNaN(deathYear) ? Math.min(deathYear, currentYear) : currentYear;

    const yearOf = (c: CareerCredit): number =>
        Number(String((c.media_type === 'movie' ? c.release_date : c.first_air_date) || '').slice(0, 4));
    const usable = (y: number) => Boolean(y) && !isNaN(y) && y >= floor && y <= ceil;

    // Si alguien solo tiene apariciones como sí mismo (un divulgador, un músico), no le
    // borramos el dato: se cae a todos sus créditos.
    let roles = credits.filter(c => !NON_ROLE_CHARACTER.test(c.character || ''));
    if (!roles.some(c => usable(yearOf(c)))) roles = credits;

    const movieYears = roles.filter(c => c.media_type === 'movie').map(yearOf).filter(usable);
    const tvYears = roles.filter(c => c.media_type !== 'movie').map(yearOf).filter(usable);
    if (movieYears.length === 0 && tvYears.length === 0) return null;

    const end = Math.max(...movieYears, ...tvYears);
    if (movieYears.length === 0) return { start: Math.min(...tvYears), end };

    const filmStart = Math.min(...movieYears);
    const tvAllowed = tvYears.filter(y => y >= filmStart - TV_LEAD_MAX_YEARS);
    return { start: Math.min(filmStart, ...(tvAllowed.length ? tvAllowed : [filmStart])), end };
}

export function processProductions<T extends { release_date?: string; first_air_date?: string }>(
    items: T[],
    dateField: 'release_date' | 'first_air_date',
    limit: number = 9
) {
    const today = new Date();
    const dateKey = dateField === 'release_date' ? 'release_date' : 'first_air_date';

    const released = items
        .filter((item: any) => item[dateKey] && new Date(item[dateKey]) <= today)
        .sort((a: any, b: any) => new Date(b[dateKey]).getTime() - new Date(a[dateKey]).getTime())
        .slice(0, limit);

    const upcoming = items
        .filter((item: any) => item[dateKey] && new Date(item[dateKey]) > today)
        .sort((a: any, b: any) => new Date(a[dateKey]).getTime() - new Date(b[dateKey]).getTime())
        .slice(0, limit);

    return { released, upcoming };
}
