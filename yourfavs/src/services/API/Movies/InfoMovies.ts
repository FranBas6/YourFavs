import {type APIMovie, type Movie} from "../../../types/ApiMovie.ts";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

const BASE_URL = "https://api.themoviedb.org/3";

// Función auxiliar para verificar si una película tiene traducción/doblaje al español de España
async function checkMovieSpanishTranslation(movieId: string): Promise<boolean> {
    try {
        // 1. Verificar traducciones de texto (subtítulos/metadata)
        const translationsUrl = `https://api.themoviedb.org/3/movie/${movieId}/translations?api_key=${API_KEY}`;
        const translationsRes = await fetch(translationsUrl);
        
        if (!translationsRes.ok) {
            return false;
        }
        
        const translationsData = await translationsRes.json();
        const translations = translationsData.translations || [];
        
        // Buscar traducción específica para español de España (es-ES)
        const hasTextTranslation = translations.some((t: any) => 
            t.iso_639_1 === 'es' && t.iso_3166_1 === 'ES'
        );
        
        // 2. Verificar información de lanzamiento para confirmar distribución en España
        const releasesUrl = `https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${API_KEY}`;
        const releasesRes = await fetch(releasesUrl);
        
        let hasSpainRelease = false;
        if (releasesRes.ok) {
            const releasesData = await releasesRes.json();
            const releases = releasesData.results || [];
            
            // Verificar si hay un lanzamiento oficial en España (ES)
            hasSpainRelease = releases.some((r: any) => r.iso_3166_1 === 'ES');
        }
        
        // La película tiene contenido en español de España si:
        // - Tiene traducción ES-ES Y tiene lanzamiento en España
        // O al menos tiene traducción ES-ES (más permisivo)
        return hasTextTranslation && hasSpainRelease;
        
    } catch (error) {
        console.error(`Error verificando traducciones para película ${movieId}:`, error);
        return false;
    }
}

// Obtener película por ID y sus plataformas de visualización
export const getMovieById = async ({ id }: { id: string }) => {
    // Obtener los detalles de la película
    const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${API_KEY}&language=es-ES`);
    const movie = await movieRes.json();

    // Verificar si tiene traducción al español de España
    const hasSpanishTranslation = await checkMovieSpanishTranslation(id);
    movie.hasSpanishTranslation = hasSpanishTranslation;

    // Obtener las plataformas de visualización de la película
    const providersRes = await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${API_KEY}`);
    const providers = await providersRes.json();

    // Extraer las plataformas disponibles en España (puedes cambiar "ES" por otro país si quieres)
    const esProviders = providers.results?.ES || {};

    // Función para mapear plataformas con su tipo (suscripción, alquiler, compra)
    const mapProviders = (list: any[] | undefined, type: 'flatrate' | 'rent' | 'buy') =>
        (list || []).map((provider: any) => ({
            provider_id: provider.provider_id,
            provider_name: provider.provider_name,
            logo_path: provider.logo_path,
            type
        }));

    const flatrate = mapProviders(esProviders.flatrate, 'flatrate');
    const rent = mapProviders(esProviders.rent, 'rent');
    const buy = mapProviders(esProviders.buy, 'buy');

    // Combinar y deduplicar (priorizando flatrate > rent > buy)
    const combined = [...flatrate, ...rent, ...buy];
    const uniqueById = new Map<number, { provider_id: number; provider_name: string; logo_path: string; type: 'flatrate' | 'rent' | 'buy' }>();

    for (const p of combined) {
        const existing = uniqueById.get(p.provider_id);
        if (!existing) {
            uniqueById.set(p.provider_id, p);
        } else {
            const priority = { flatrate: 3, rent: 2, buy: 1 } as const;
            if (priority[p.type] > priority[existing.type]) uniqueById.set(p.provider_id, p);
        }
    }

    // Añadir las plataformas a la película
    movie.providers = Array.from(uniqueById.values());

    return movie;
};

// Interfaz para el tipo de datos del reparto de películas
interface MovieCastMember {
    id: number;
    name: string;
    character: string;
    profile_path?: string; // ✅ añadimos esta propiedad opcional
}

// Función modificada para obtener el reparto de películas con información del personaje
export const getMovieCast = async (movieId: string): Promise<MovieCastMember[]> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        // Verificar si data.cast existe
        if (!data.cast) {
            console.error("No se encontró información del reparto");
            return [];
        }

        return data.cast.map((actor: any) => ({
            id: actor.id,
            name: actor.name,
            character: actor.character || "",
            profile_path: actor.profile_path || null  // ✅ lo incluimos aquí
        }));
    } catch (error) {
        console.error("Error al obtener el reparto:", error);
        return [];
    }
};

// Función para obtener directores y roles específicos de una película
export const getMovieDirectorsAndRoles = async (movieId: string): Promise<{ name: string, job: string }[]> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Error en la solicitud: ${response.statusText}`);
        }

        const data = await response.json();

        // Verificar si data.crew existe
        if (!data.crew) {
            console.error("No se encontró información del equipo");
            return [];
        }

        const relevantRoles = ["Director", "Producer", "Executive Producer", "Director of Photography", "Original Music Composer", "Screenplay", "Writer", "Editor"];

        return data.crew
            .filter((member: any) => relevantRoles.includes(member.job))
            .map((person: any) => ({name: person.name, job: person.job}))
    } catch (error) {
        console.error("Hubo un error al obtener los datos de los directores y roles de la película:", error);
        return [];
    }
};

// Funcion para obtener el trailer de una película
export const getMovieTrailer = async (movieId: string): Promise<string | null> => {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        const trailer = data.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');

        // Sí se encuentra el trailer, devolver el enlace al video en YouTube
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch (error) {
        console.error("Hubo un error al obtener el trailer:", error);
        return null;
    }
};

// Interfaz original TMDB
interface TMDBPosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

// Interfaz para nuestra app
export interface PosterImage {
    aspect_ratio: number;
    height: number;
    iso_639_1: string | null;
    file_path: string;
    vote_average: number;
    vote_count: number;
    width: number;
}

// Función para obtener todos los pósters de una película
export const fetchAllMoviePosters = async (
    movieId: string | number,
    language: string = "es-ES"
): Promise<PosterImage[]> => {
    const numericId = typeof movieId === 'string' ? parseInt(movieId, 10) : movieId;
    const baseUrl = `https://api.themoviedb.org/3`;
    const fullImagePath = (path: string) => `https://image.tmdb.org/t/p/original${path}`;

    try {
        // Obtener pósters de la película
        const movieImagesRes = await fetch(`${baseUrl}/movie/${numericId}/images?api_key=${API_KEY}`);
        const movieImagesData = await movieImagesRes.json();
        let posters: TMDBPosterImage[] = movieImagesData.posters || [];

        // Filtrar por idioma si se especifica
        if (language !== "" && language !== "all") {
            posters = posters.filter(poster => poster.iso_639_1 === language.split('-')[0] || poster.iso_639_1 === null);
        }

        // Devolver los pósters con URL completa
        return posters.map(poster => ({
            ...poster,
            file_path: fullImagePath(poster.file_path)
        }));

    } catch (error) {
        console.error(`Error al obtener los pósters de la película ${numericId}:`, error);
        return [];
    }
};

export interface MovieCollectionInfo {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string | null;
    parts: MovieCollectionPart[];
}

export interface MovieCollectionPart {
    id: number;
    title: string;
    poster_path: string | null;
    release_date: string | null;
}

// Función para obtener información de una colección de películas
export const getMovieCollectionInfo = async (
    collectionId: number
): Promise<MovieCollectionInfo | null> => {
    const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${API_KEY}&language=es-ES`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en la solicitud: ${res.statusText}`);
        }

        const data = await res.json();
        return {
            id: data.id,
            name: data.name,
            poster_path: data.poster_path
                ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
                : null,
            backdrop_path: data.backdrop_path
                ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
                : null,
            overview: data.overview || null,
            parts: data.parts?.map((part: any) => ({
                id: part.id,
                title: part.title,
                poster_path: part.poster_path ? `https://image.tmdb.org/t/p/w200${part.poster_path}` : null,
                release_date: part.release_date
            })) || []
        };
    } catch (error) {
        console.error("Hubo un error al obtener la colección:", error);
        return null;
    }
};

type TMDBResponse = {
    results: Movie[];
    total_results: number;
    total_pages: number;
    page: number;
};

// Método para obtener películas recomendadas desde TMDB
export async function getMovieRecommendations(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    total_results?: number;
    error?: string;
}> {
    try {
        // Obtener la colección de la película original
        const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}&language=es-ES`);
        if (!movieRes.ok) throw new Error(`Error ${movieRes.status}: ${movieRes.statusText}`);
        const movieData = await movieRes.json();
        const collectionId = movieData.belongs_to_collection?.id;

        // Obtener recomendaciones iniciales
        const recRes = await fetch(`https://api.themoviedb.org/3/movie/${movieId}/recommendations?api_key=${API_KEY}&language=es-ES&page=1`);
        if (!recRes.ok) throw new Error(`Error ${recRes.status}: ${recRes.statusText}`);
        const recData: TMDBResponse = await recRes.json();

        // Filtrar las recomendaciones con poster
        const filteredRaw = recData.results.filter((movie: any) => movie.poster_path);

        // Obtener detalles solo de las necesarias (hasta 12)
        const detailedPromises = filteredRaw.slice(0, 20).map(async (movie: any) => {
            const res = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${API_KEY}&language=es-ES`);
            if (!res.ok) return null;
            const data = await res.json();
            if (collectionId && data.belongs_to_collection?.id === collectionId) return null; // 🔥 excluir misma colección

            return {
                adult: data.adult,
                backdrop_path: data.backdrop_path ? `https://image.tmdb.org/t/p/w500${data.backdrop_path}` : "",
                genre_ids: data.genres?.map((g: any) => g.id) || [],
                id: data.id.toString(),
                original_language: data.original_language,
                overview: data.overview,
                popularity: data.popularity,
                poster_path: `https://image.tmdb.org/t/p/w500${data.poster_path}`,
                title: data.title,
                vote_average: data.vote_average,
                vote_count: data.vote_count,
                original_title: data.original_title,
                release_date: data.release_date,
                video: data.video
            } as Movie;
        });

        const detailedMovies = (await Promise.all(detailedPromises)).filter(Boolean).slice(0, 12) as Movie[];

        return {
            success: true,
            recommendations: detailedMovies,
            total_results: recData.total_results
        };

    } catch (error) {
        console.error('Error al obtener recomendaciones:', error);
        return {
            success: false,
            recommendations: [],
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

// Método alternativo para obtener películas similares si no hay recomendaciones
export async function getSimilarMovies(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    total_results?: number;
    error?: string;
}> {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/movie/${movieId}/similar?api_key=${API_KEY}&language=es-ES&page=1`
        );

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data: TMDBResponse = await response.json();

        const similarMovies = data.results
            .filter((movie: Movie) => movie.poster_path)
            .slice(0, 12)
            .map((movie: Movie): Movie => ({
                adult: movie.adult,
                backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : "",
                genre_ids: movie.genre_ids,
                id: movie.id.toString(), // Convertir a string para coincidir con tu tipo Movie
                original_language: movie.original_language,
                overview: movie.overview,
                popularity: movie.popularity,
                poster_path: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
                title: movie.title,
                vote_average: movie.vote_average,
                vote_count: movie.vote_count,
                original_title: movie.original_title,
                release_date: movie.release_date,
                video: movie.video
            }));

        return {
            success: true,
            recommendations: similarMovies,
            total_results: data.total_results
        };

    } catch (error) {
        console.error('Error al obtener películas similares:', error);
        return {
            success: false,
            recommendations: [],
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}

// Método combinado que intenta recomendaciones primero, luego similares
export async function getMovieRecommendationsOrSimilar(movieId: number): Promise<{
    success: boolean;
    recommendations: Movie[];
    type: 'recommendations' | 'similar' | 'combined';
    error?: string;
}> {
    // Intentar obtener recomendaciones primero
    let result = await getMovieRecommendations(movieId);

    // Si no hay recomendaciones o son muy pocas, intentar con similares
    if (!result.success || result.recommendations.length < 6) {
        const similarResult = await getSimilarMovies(movieId);

        if (similarResult.success) {
            // Combinar recomendaciones y similares si ambas existen
            if (result.success && result.recommendations.length > 0) {
                const combined = [...result.recommendations, ...similarResult.recommendations];
                // Eliminar duplicados basándose en el ID
                const unique = combined.filter((movie: Movie, index: number, self: Movie[]) =>
                    index === self.findIndex((m: Movie) => m.id === movie.id)
                );

                return {
                    success: true,
                    recommendations: unique.slice(0, 12),
                    type: 'combined'
                };
            } else {
                return {
                    success: true,
                    recommendations: similarResult.recommendations,
                    type: 'similar'
                };
            }
        }
    }

    return {
        ...result,
        type: 'recommendations'
    };
}

// Función para obtener información adicional de la movie (redes, palabras clave, etc.)
export const getMoviesAdditionalInfo = async (movieId: string) => {
    try {
        // Obtener keywords
        const keywordsRes = await fetch(`${BASE_URL}/movie/${movieId}/keywords?api_key=${API_KEY}`);
        const keywordsData = await keywordsRes.json();

        // Obtener información detallada de la película que incluye networks
        const detailRes = await fetch(`${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=es-ES&append_to_response=content_ratings`);
        const detailData = await detailRes.json();
        
        return {
            keywords: keywordsData.results || [],
            networks: detailData.networks || [],
            content_ratings: detailData.content_ratings?.results || [],
            episode_run_time: detailData.episode_run_time || [],
            languages: detailData.spoken_languages || [],
            tagline: detailData.tagline || null
        };
    } catch (error) {
        console.error('Error al obtener información adicional de la serie:', error);
        return {
            keywords: [],
            networks: [],
            content_ratings: [],
            episode_run_time: [],
            languages: [],
            tagline: null
        };
    }
};