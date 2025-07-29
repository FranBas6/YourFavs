import {type APISerie, type Serie} from "../../../types/ApiSerie.ts"; // Asegúrate de tener este tipo definido
import {type APIMovie, type Movie} from "../../../types/ApiMovie.ts";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

// Obtener series en las que participa un actor o actriz por ID
export const getSeriesByActorId = async ({id}: { id: string }): Promise<Serie[]> => {
    try {
        // Obtener créditos combinados directamente con el ID
        const creditsUrl = `https://api.themoviedb.org/3/person/${id}/combined_credits?api_key=${API_KEY}&language=es-ES`;
        const creditsRes = await fetch(creditsUrl);
        if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
        const creditsData = await creditsRes.json();

        const series: Serie[] = creditsData.cast.filter((item: any) => item.media_type === "tv");

        // Ordenar primero por popularidad (de mayor a menor) y luego por valoración
        return series.sort((a, b) => {
            const popularityDiff = (b as any).popularity - (a as any).popularity;
            if (popularityDiff !== 0) return popularityDiff;
            return (b as any).vote_average - (a as any).vote_average;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las series del actor:", error);
        return [];
    }
};

// Obtener películas en las que participa un actor o actriz por ID
export const getMoviesByActorId = async ({id}: { id: string }): Promise<Movie[]> => {
    try {
        // Obtener créditos combinados directamente con el ID
        const creditsUrl = `https://api.themoviedb.org/3/person/${id}/combined_credits?api_key=${API_KEY}&language=es-ES`;
        const creditsRes = await fetch(creditsUrl);
        if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
        const creditsData = await creditsRes.json();

        const movies: Movie[] = creditsData.cast.filter((item: any) => item.media_type === "movie");

        // Ordenar primero por popularidad (de mayor a menor) y luego por valoración
        return movies.sort((a, b) => {
            const popularityDiff = (b as any).popularity - (a as any).popularity;
            if (popularityDiff !== 0) return popularityDiff;
            return (b as any).vote_average - (a as any).vote_average;
        });

    } catch (error) {
        console.error("Hubo un error al obtener las películas del actor:", error);
        return [];
    }
};

// Obtener detalles de un actor o actriz por ID
export const getActorDetailsById = async ({id}: { id: string }) => {
    try {
        const [detailsRes, socialsRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/person/${id}?api_key=${API_KEY}&language=es-ES`),
            fetch(`https://api.themoviedb.org/3/person/${id}/external_ids?api_key=${API_KEY}`)
        ]);

        if (!detailsRes.ok) throw new Error(`Error al obtener los detalles: ${detailsRes.statusText}`);
        if (!socialsRes.ok) throw new Error(`Error al obtener redes sociales: ${socialsRes.statusText}`);

        const actorDetails = await detailsRes.json();
        const socialLinks = await socialsRes.json();

        return {
            id: actorDetails.id,
            nombre: actorDetails.name,
            biografia: actorDetails.biography,
            lugarNacimiento: actorDetails.place_of_birth,
            fechaNacimiento: actorDetails.birthday,
            imagen: actorDetails.profile_path,
            popularidad: actorDetails.popularity,
            conocidoPor: actorDetails.known_for_department,
            redes: {
                imdb: socialLinks.imdb_id ? `https://www.imdb.com/name/${socialLinks.imdb_id}` : null,
                twitter: socialLinks.twitter_id ? `https://twitter.com/${socialLinks.twitter_id}` : null,
                instagram: socialLinks.instagram_id ? `https://instagram.com/${socialLinks.instagram_id}` : null,
                facebook: socialLinks.facebook_id ? `https://facebook.com/${socialLinks.facebook_id}` : null,
                tiktok: socialLinks.tiktok_id ? `https://www.tiktok.com/@${socialLinks.tiktok_id}` : null,
                youtube: socialLinks.youtube_id ? `https://www.youtube.com/${socialLinks.youtube_id}` : null,
            }
        };

    } catch (error) {
        console.error("Hubo un error al obtener los detalles del actor:", error);
        return null;
    }
};

interface TMDBProfileImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

export interface ActorImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string; // ruta completa
    vote_average: number;
    vote_count: number;
    width: number;
}

export const fetchActorImages = async (
    actorId: number | string,
    language: string = "es-ES"
): Promise<ActorImage[]> => {
    const numericId = typeof actorId === 'string' ? parseInt(actorId, 10) : actorId;
    const baseUrl = `https://api.themoviedb.org/3`;
    const fullImagePath = (path: string) => `https://image.tmdb.org/t/p/original${path}`;

    try {
        const res = await fetch(`${baseUrl}/person/${numericId}/images?api_key=${API_KEY}`);
        const data = await res.json();

        let images: TMDBProfileImage[] = data.profiles || [];

        // Filtrar por idioma si aplica (aunque los perfiles suelen ser sin idioma)
        if (language !== "" && language !== "all") {
            images = images.filter(img => img.iso_639_1 === language.split('-')[0] || img.iso_639_1 === null);
        }

        // Formatear imágenes con ruta completa
        return images.map(img => ({
            ...img,
            file_path: fullImagePath(img.file_path)
        }));

    } catch (error) {
        console.error(`Error al obtener imágenes del actor ${numericId}:`, error);
        return [];
    }
};