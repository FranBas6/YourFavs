import { type Serie } from "../../../types/ApiSerie.ts";
import { type Movie } from "../../../types/ApiMovie.ts";
import { tmdbFetch, originalUrl } from '../shared/tmdbClient';

const sortByPopularityAndRating = (a: any, b: any) => {
    const popDiff = b.popularity - a.popularity;
    return popDiff !== 0 ? popDiff : b.vote_average - a.vote_average;
};

export const getMoviesAndSeriesByActorId = async ({ id }: { id: string }): Promise<{ movies: Movie[]; series: Serie[] }> => {
    try {
        const creditsData = await tmdbFetch<{ cast: any[] }>(`/person/${id}/combined_credits`);
        return {
            movies: creditsData.cast.filter((item: any) => item.media_type === 'movie').sort(sortByPopularityAndRating),
            series: creditsData.cast.filter((item: any) => item.media_type === 'tv').sort(sortByPopularityAndRating),
        };
    } catch (error) {
        console.error('Error al obtener los créditos del actor:', error);
        return { movies: [], series: [] };
    }
};

export const getSeriesByActorId = async ({ id }: { id: string }): Promise<Serie[]> => {
    try {
        const creditsData = await tmdbFetch<{ cast: any[] }>(`/person/${id}/combined_credits`);
        return creditsData.cast.filter((item: any) => item.media_type === 'tv').sort(sortByPopularityAndRating);
    } catch (error) {
        console.error('Error al obtener las series del actor:', error);
        return [];
    }
};

export const getMoviesByActorId = async ({ id }: { id: string }): Promise<Movie[]> => {
    try {
        const creditsData = await tmdbFetch<{ cast: any[] }>(`/person/${id}/combined_credits`);
        return creditsData.cast.filter((item: any) => item.media_type === 'movie').sort(sortByPopularityAndRating);
    } catch (error) {
        console.error('Error al obtener las películas del actor:', error);
        return [];
    }
};

export const getActorDetailsById = async ({ id }: { id: string }) => {
    try {
        const [actorDetails, socialLinks] = await Promise.all([
            tmdbFetch<any>(`/person/${id}`),
            tmdbFetch<any>(`/person/${id}/external_ids`, {}),
        ]);

        return {
            id: actorDetails.id,
            nombre: actorDetails.name,
            biografia: actorDetails.biography,
            lugarNacimiento: actorDetails.place_of_birth,
            fechaNacimiento: actorDetails.birthday,
            fechaFallecimiento: actorDetails.deathday ?? null,
            imagen: actorDetails.profile_path,
            popularidad: actorDetails.popularity,
            conocidoPor: actorDetails.known_for_department,
            genero: typeof actorDetails.gender === 'number' ? actorDetails.gender : null,
            alias: Array.isArray(actorDetails.also_known_as) ? actorDetails.also_known_as : [],
            homepage: actorDetails.homepage || null,
            redes: {
                imdb: socialLinks.imdb_id ? `https://www.imdb.com/name/${socialLinks.imdb_id}` : null,
                twitter: socialLinks.twitter_id ? `https://twitter.com/${socialLinks.twitter_id}` : null,
                instagram: socialLinks.instagram_id ? `https://instagram.com/${socialLinks.instagram_id}` : null,
                facebook: socialLinks.facebook_id ? `https://facebook.com/${socialLinks.facebook_id}` : null,
                tiktok: socialLinks.tiktok_id ? `https://www.tiktok.com/@${socialLinks.tiktok_id}` : null,
                youtube: socialLinks.youtube_id ? `https://www.youtube.com/${socialLinks.youtube_id}` : null,
            },
        };
    } catch (error) {
        console.error('Error al obtener los detalles del actor:', error);
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
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

export interface TaggedImage {
    file_path: string;
    media: {
        id: number;
        title?: string;
        name?: string;
        poster_path?: string;
    } | null;
    media_type: string;
}

export const fetchTaggedImages = async (actorId: number | string): Promise<TaggedImage[]> => {
    const numericId = typeof actorId === 'string' ? parseInt(actorId, 10) : actorId;
    try {
        const data = await tmdbFetch<{ results: any[] }>(`/person/${numericId}/tagged_images`, {
            page: '1',
        });
        return (data.results || [])
            .filter((img: any) => img.file_path && img.aspect_ratio > 1)
            .slice(0, 20)
            .map((img: any) => ({
                file_path: originalUrl(img.file_path),
                media: img.media ? { id: img.media.id, title: img.media.title, name: img.media.name, poster_path: img.media.poster_path } : null,
                media_type: img.media_type || '',
            }));
    } catch {
        return [];
    }
};

export const fetchActorImages = async (
    actorId: number | string,
    language: string = "es-ES"
): Promise<ActorImage[]> => {
    const numericId = typeof actorId === 'string' ? parseInt(actorId, 10) : actorId;

    try {
        const data = await tmdbFetch<{ profiles: TMDBProfileImage[] }>(`/person/${numericId}/images`, {});

        let images = data.profiles || [];

        if (language !== "" && language !== "all") {
            images = images.filter(img => img.iso_639_1 === language.split('-')[0] || img.iso_639_1 === null);
        }

        return images.map(img => ({
            ...img,
            file_path: originalUrl(img.file_path),
        }));
    } catch (error) {
        console.error(`Error al obtener imágenes del actor ${numericId}:`, error);
        return [];
    }
};
