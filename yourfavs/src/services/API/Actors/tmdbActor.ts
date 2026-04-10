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

export const getActorsByName = async ({ name, page }: { name: string; page?: string }): Promise<Actor[]> => {
    try {
        const results = await tmdbFetchList<any>('/search/person', {
            query: encodeURIComponent(name),
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
