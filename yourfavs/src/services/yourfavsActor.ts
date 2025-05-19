import {type APISerie, type Serie} from "../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido
import {type APIMovie, type Movie} from "../types/ApiMovie.ts";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY; // Reemplázalo con tu API Key de TMDb

/// Obtener series en las que participa un actor o actriz
export const getSeriesByActorName = async ({ name }: { name: string }): Promise<Serie[]> => {
    try {
        // 1. Buscar el ID de la persona
        const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
        const searchData = await searchRes.json();

        const person = searchData.results[0];
        if (!person) throw new Error("No se encontró la persona");

        const personId = person.id;

        // 2. Obtener créditos combinados
        const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}&language=es-ES`;
        const creditsRes = await fetch(creditsUrl);
        if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
        const creditsData = await creditsRes.json();

        const series: Serie[] = creditsData.cast.filter((item: any) => item.media_type === "tv");

        // 3. Ordenar primero por popularidad (de mayor a menor) y luego por valoración
        return series.sort((a, b) => {
            const popularityDiff = (b as any).popularity - (a as any).popularity;
            if (popularityDiff !== 0) return popularityDiff;
            // Si tienen la misma popularidad, ordenar por valoración
            return (b as any).vote_average - (a as any).vote_average;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series del actor:", error);
        return [];
    }
};


// Obtener películas en las que participa un actor o actriz
export const getMoviesByActorName = async ({ name }: { name: string }): Promise<Movie[]> => {
    try {
        // 1. Buscar el ID de la persona
        const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
        const searchData = await searchRes.json();

        const person = searchData.results[0];
        if (!person) throw new Error("No se encontró la persona");

        const personId = person.id;

        // 2. Obtener créditos combinados
        const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}&language=es-ES`;
        const creditsRes = await fetch(creditsUrl);
        if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
        const creditsData = await creditsRes.json();

        const movies: Movie[] = creditsData.cast.filter((item: any) => item.media_type === "movie");

        // 3. Ordenar primero por popularidad (de mayor a menor) y luego por valoración
        return movies.sort((a, b) => {
            const popularityDiff = (b as any).popularity - (a as any).popularity;
            if (popularityDiff !== 0) return popularityDiff;
            // Si tienen la misma popularidad, ordenar por valoración
            return (b as any).vote_average - (a as any).vote_average;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las películas del actor:", error);
        return [];
    }
};

// Obtener detalles de un actor o actriz por nombre
export const getActorDetails = async ({ name }: { name: string }) => {
    try {
        // 1. Buscar TODOS los resultados posibles
        const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
        const searchData = await searchRes.json();

        const persons = searchData.results;
        if (!persons || persons.length === 0) throw new Error("No se encontró ninguna persona");

        // 2. Ordenar los resultados por popularidad
        const sortedPersons = persons.sort((a: any, b: any) => b.popularity - a.popularity);

        // 3. Elegir el más popular
        const mostPopularPerson = sortedPersons[0];

        const personId = mostPopularPerson.id;

        // 4. Obtener detalles de esa persona
        const detailsUrl = `https://api.themoviedb.org/3/person/${personId}?api_key=${API_KEY}&language=es-ES`;
        const detailsRes = await fetch(detailsUrl);
        if (!detailsRes.ok) throw new Error(`Error al obtener los detalles: ${detailsRes.statusText}`);
        const actorDetails = await detailsRes.json();

        return {
            id: actorDetails.id,
            nombre: actorDetails.name,
            biografia: actorDetails.biography,
            lugarNacimiento: actorDetails.place_of_birth,
            fechaNacimiento: actorDetails.birthday,
            imagen: actorDetails.profile_path, // Solo devuelve la ruta, no la URL completa
            popularidad: actorDetails.popularity,
            conocidoPor: actorDetails.known_for_department
        };

    } catch (error) {
        console.error("Hubo un error al obtener los detalles del actor:", error);
        return null;
    }
};


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

        // Obtener detalles para cada actor encontrado
        const actorDetailsList: Actor[] = await Promise.all(
            results.map(async (actor: any) => {
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

