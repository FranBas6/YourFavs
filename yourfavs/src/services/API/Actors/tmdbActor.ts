const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

// Tipo detallado para Actor
export interface Actor {
    id: number;
    nombre: string;
    biografia: string;
    lugarNacimiento: string | null;
    fechaNacimiento: string | null;
    imagen: string | null; // Esta es solo la ruta, no la URL completa
    popularidad: number;
    conocidoPor: string;
}

// Obtener actores/actrices por nombre y devolver datos detallados
export const getActorsByName = async ({ name, page }: { name: string, page?: string }): Promise<Actor[]> => {
    const pageNumber = page || "1";

    const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&query=${encodeURIComponent(name)}&language=es-ES&page=${pageNumber}`;

    try {
        const res = await fetch(searchUrl);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : [];

        // Filtrar solo personas cuyo departamento conocido sea "Acting"
        const actors = results.filter((person: any) =>
            person.known_for_department === "Acting"
        );

        // Obtener detalles para cada actor encontrado
        const actorDetailsList: Actor[] = await Promise.all(
            actors.map(async (actor: any) => {
                const detailsUrl = `https://api.themoviedb.org/3/person/${actor.id}?api_key=${API_KEY}&language=es-ES`;
                const detailsRes = await fetch(detailsUrl);
                if (!detailsRes.ok) throw new Error(`Error al obtener detalles del actor ${actor.id}`);
                const actorDetails = await detailsRes.json();

                return {
                    id: actorDetails.id,
                    nombre: actorDetails.name,
                    biografia: actorDetails.biography,
                    lugarNacimiento: actorDetails.place_of_birth,
                    fechaNacimiento: actorDetails.birthday,
                    imagen: actorDetails.profile_path,
                    popularidad: actorDetails.popularity,
                    conocidoPor: actorDetails.known_for_department
                };
            })
        );

        // Ordenar por popularidad descendente
        return actorDetailsList.sort((a, b) => b.popularidad - a.popularidad);
    } catch (error) {
        console.error("Hubo un error al obtener los actores:", error);
        return [];
    }
};

