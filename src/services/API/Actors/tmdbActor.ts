import { tmdbFetch, tmdbFetchList } from '../shared/tmdbClient';

export interface Actor {
    id: number;
    nombre: string;
    biografia: string;
    lugarNacimiento: string | null;
    fechaNacimiento: string | null;
    imagen: string | null;
    popularidad: number;
    conocidoPor: string;
}

/**
 * Créditos combinados (pelis + series) en los que ACTÚA una persona.
 * Base de "Buscar por reparto": la intersección de estos créditos entre varios
 * actores da los títulos donde coinciden. Se usa esto (y no /discover) porque
 * `/discover/tv` NO admite filtrar por persona — `with_cast`/`with_people` solo
 * funcionan en `/discover/movie`. combined_credits cubre ambos tipos de una vez.
 * Devuelve el array `cast` crudo: cada item trae media_type, id, title/name,
 * poster_path, vote_average, popularity, release_date/first_air_date, genre_ids.
 */
export const getCombinedCastCredits = async (personId: string): Promise<any[]> => {
    try {
        const data = await tmdbFetch<{ cast?: any[] }>(`/person/${personId}/combined_credits`);
        return Array.isArray(data?.cast) ? data.cast : [];
    } catch (error) {
        console.error(`❌ Error combined_credits persona ${personId}:`, error);
        return [];
    }
};

export const getActorsByName = async ({ name, page }: { name: string; page?: string }): Promise<Actor[]> => {
    try {
        const results = await tmdbFetchList<any>('/search/person', {
            query: name, // tmdbFetch ya lo codifica (con encodeURIComponent llegaba «Tom%20Hanks» literal)
            page: page || '1',
        });

        const actors = results.filter((person: any) => person.known_for_department === 'Acting');

        const actorDetailsRaw = await Promise.all(
            actors.map(async (actor: any): Promise<Actor | null> => {
                try {
                    const details = await tmdbFetch<any>(`/person/${actor.id}`);
                    return {
                        id: details.id,
                        nombre: details.name,
                        biografia: details.biography,
                        lugarNacimiento: details.place_of_birth,
                        fechaNacimiento: details.birthday,
                        imagen: details.profile_path,
                        popularidad: details.popularity,
                        conocidoPor: details.known_for_department,
                    };
                } catch {
                    return null;
                }
            })
        );

        return (actorDetailsRaw.filter(Boolean) as Actor[]).sort((a, b) => b.popularidad - a.popularidad);
    } catch (error) {
        console.error('Error al obtener los actores:', error);
        return [];
    }
};
