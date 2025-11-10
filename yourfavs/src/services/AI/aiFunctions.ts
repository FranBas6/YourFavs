/**
 * Servicio que proporciona funciones que la IA puede usar
 * para consultar TMDB y navegar en la app
 */

import { 
    searchInFavoriteMovies, 
    searchInFavoriteSeries, 
    searchInPendingMovies,
    searchInPendingSeries,
    searchInWatchedMovies,
    searchInWatchedSeries,
    searchInLikedMovies,
    searchInLikedSeries,
    searchInFavoriteActors,
    getUserListsStats 
} from "./userDataFunctions";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const OMDB_API_KEY = import.meta.env.PUBLIC_OMDB_API_KEY;
const OMDB_BASE_URL = "http://www.omdbapi.com";

export interface AIFunction {
    name: string;
    description: string;
    parameters: any;
    execute: (...args: any[]) => Promise<any>;
}

/**
 * Buscar información de una película en TMDB
 */
async function searchMovie(title: string) {
    try {
        const response = await fetch(
            `${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(title)}`
        );
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const movie = data.results[0];
            return {
                success: true,
                data: {
                    id: movie.id,
                    title: movie.title,
                    overview: movie.overview,
                    release_date: movie.release_date,
                    vote_average: movie.vote_average,
                    genres: movie.genre_ids,
                    // Formato especial para que la IA lo use en sus respuestas
                    formatted: `[MOVIE:${movie.id}:${movie.title}]`
                }
            };
        }
        return { success: false, error: "No se encontró la película" };
    } catch (error) {
        return { success: false, error: "Error al buscar la película" };
    }
}

/**
 * Buscar información de una serie en TMDB
 */
async function searchSeries(name: string) {
    try {
        const response = await fetch(
            `${BASE_URL}/search/tv?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(name)}`
        );
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const serie = data.results[0];
            return {
                success: true,
                data: {
                    id: serie.id,
                    name: serie.name,
                    overview: serie.overview,
                    first_air_date: serie.first_air_date,
                    vote_average: serie.vote_average,
                    // Formato especial para que la IA lo use en sus respuestas
                    formatted: `[SERIE:${serie.id}:${serie.name}]`
                }
            };
        }
        return { success: false, error: "No se encontró la serie" };
    } catch (error) {
        return { success: false, error: "Error al buscar la serie" };
    }
}

/**
 * Obtener detalles de una serie incluyendo siguiente episodio
 */
async function getSeriesDetails(seriesId: number) {
    try {
        const response = await fetch(
            `${BASE_URL}/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`
        );
        const data = await response.json();
        
        return {
            success: true,
            data: {
                name: data.name,
                number_of_seasons: data.number_of_seasons,
                number_of_episodes: data.number_of_episodes,
                status: data.status,
                next_episode_to_air: data.next_episode_to_air,
                last_episode_to_air: data.last_episode_to_air
            }
        };
    } catch (error) {
        return { success: false, error: "Error al obtener detalles de la serie" };
    }
}

/**
 * Obtener películas en cartelera
 */
async function getMoviesInTheaters() {
    try {
        const response = await fetch(
            `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=es-ES&region=ES`
        );
        const data = await response.json();
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: movies
        };
    } catch (error) {
        return { success: false, error: "Error al obtener películas en cartelera" };
    }
}

/**
 * Obtener próximos estrenos
 */
async function getUpcomingMovies() {
    try {
        const response = await fetch(
            `${BASE_URL}/movie/upcoming?api_key=${API_KEY}&language=es-ES&region=ES`
        );
        const data = await response.json();
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            overview: movie.overview,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: movies
        };
    } catch (error) {
        return { success: false, error: "Error al obtener próximos estrenos" };
    }
}

/**
 * Obtener películas similares o recomendaciones basadas en una película
 * Combina múltiples endpoints para mejores resultados
 */
async function getSimilarMovies(movieTitle: string, useSimilar: boolean = true) {
    try {
        // Primero buscar la película para obtener su ID y detalles
        const searchResponse = await fetch(
            `${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(movieTitle)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró la película "${movieTitle}"`
            };
        }
        
        const movie = searchData.results[0];
        const movieId = movie.id;
        
        // Obtener detalles completos de la película para tener géneros
        const detailsResponse = await fetch(
            `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=es-ES`
        );
        const movieDetails = await detailsResponse.json();
        const movieGenres = movieDetails.genres.map((g: any) => g.id);
        
        // Obtener recomendaciones
        const recommendationsResponse = await fetch(
            `${BASE_URL}/movie/${movieId}/recommendations?api_key=${API_KEY}&language=es-ES&page=1`
        );
        const recommendationsData = await recommendationsResponse.json();
        
        // Obtener similares
        const similarResponse = await fetch(
            `${BASE_URL}/movie/${movieId}/similar?api_key=${API_KEY}&language=es-ES&page=1`
        );
        const similarData = await similarResponse.json();
        
        // Combinar ambos resultados
        let allResults = [
            ...(recommendationsData.results || []),
            ...(similarData.results || [])
        ];
        
        if (allResults.length === 0) {
            return {
                success: false,
                error: `No se encontraron películas similares a "${movie.title}"`
            };
        }
        
        // Eliminar duplicados por ID
        const uniqueResults = allResults.filter((item, index, self) =>
            index === self.findIndex((t) => t.id === item.id)
        );
        
        // Calcular puntuación de relevancia para cada película
        const scoredResults = uniqueResults.map((rec: any) => {
            let score = rec.vote_average || 0; // Base: valoración
            
            // Bonus por géneros compartidos
            const sharedGenres = rec.genre_ids?.filter((g: number) => movieGenres.includes(g)).length || 0;
            score += sharedGenres * 1.5; // +1.5 puntos por cada género compartido
            
            // Bonus por popularidad
            score += Math.log10(rec.popularity || 1) * 0.5;
            
            // Penalización si la valoración es muy baja (menos de 5)
            if (rec.vote_average < 5) {
                score -= 2;
            }
            
            // Bonus si tiene muchos votos (es popular)
            if (rec.vote_count > 1000) {
                score += 1;
            }
            
            return {
                ...rec,
                relevanceScore: score
            };
        });
        
        // Ordenar por puntuación de relevancia
        scoredResults.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
        
        // Tomar las 10 mejores
        const topRecommendations = scoredResults.slice(0, 10).map((rec: any) => ({
            id: rec.id,
            title: rec.title,
            overview: rec.overview,
            release_date: rec.release_date,
            vote_average: rec.vote_average,
            genres: rec.genre_ids,
            formatted: `[MOVIE:${rec.id}:${rec.title}]`
        }));
        
        return {
            success: true,
            data: {
                basedOn: movie.title,
                basedOnFormatted: `[MOVIE:${movieId}:${movie.title}]`,
                basedOnGenres: movieDetails.genres.map((g: any) => g.name).join(', '),
                recommendations: topRecommendations,
                totalFound: uniqueResults.length
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar películas similares"
        };
    }
}

/**
 * Obtener series similares o recomendaciones basadas en una serie
 * Combina múltiples endpoints para mejores resultados
 */
async function getSimilarSeries(seriesName: string, useSimilar: boolean = true) {
    try {
        // Primero buscar la serie para obtener su ID
        const searchResponse = await fetch(
            `${BASE_URL}/search/tv?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(seriesName)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró la serie "${seriesName}"`
            };
        }
        
        const series = searchData.results[0];
        const seriesId = series.id;
        
        // Obtener detalles completos de la serie para tener géneros
        const detailsResponse = await fetch(
            `${BASE_URL}/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`
        );
        const seriesDetails = await detailsResponse.json();
        const seriesGenres = seriesDetails.genres.map((g: any) => g.id);
        
        // Obtener recomendaciones
        const recommendationsResponse = await fetch(
            `${BASE_URL}/tv/${seriesId}/recommendations?api_key=${API_KEY}&language=es-ES&page=1`
        );
        const recommendationsData = await recommendationsResponse.json();
        
        // Obtener similares
        const similarResponse = await fetch(
            `${BASE_URL}/tv/${seriesId}/similar?api_key=${API_KEY}&language=es-ES&page=1`
        );
        const similarData = await similarResponse.json();
        
        // Combinar ambos resultados
        let allResults = [
            ...(recommendationsData.results || []),
            ...(similarData.results || [])
        ];
        
        if (allResults.length === 0) {
            return {
                success: false,
                error: `No se encontraron series similares a "${series.name}"`
            };
        }
        
        // Eliminar duplicados por ID
        const uniqueResults = allResults.filter((item, index, self) =>
            index === self.findIndex((t) => t.id === item.id)
        );
        
        // Calcular puntuación de relevancia para cada serie
        const scoredResults = uniqueResults.map((rec: any) => {
            let score = rec.vote_average || 0; // Base: valoración
            
            // Bonus por géneros compartidos
            const sharedGenres = rec.genre_ids?.filter((g: number) => seriesGenres.includes(g)).length || 0;
            score += sharedGenres * 1.5; // +1.5 puntos por cada género compartido
            
            // Bonus por popularidad
            score += Math.log10(rec.popularity || 1) * 0.5;
            
            // Penalización si la valoración es muy baja (menos de 5)
            if (rec.vote_average < 5) {
                score -= 2;
            }
            
            // Bonus si tiene muchos votos (es popular)
            if (rec.vote_count > 1000) {
                score += 1;
            }
            
            return {
                ...rec,
                relevanceScore: score
            };
        });
        
        // Ordenar por puntuación de relevancia
        scoredResults.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
        
        // Tomar las 10 mejores
        const topRecommendations = scoredResults.slice(0, 10).map((rec: any) => ({
            id: rec.id,
            name: rec.name,
            overview: rec.overview,
            first_air_date: rec.first_air_date,
            vote_average: rec.vote_average,
            genres: rec.genre_ids,
            formatted: `[SERIE:${rec.id}:${rec.name}]`
        }));
        
        return {
            success: true,
            data: {
                basedOn: series.name,
                basedOnFormatted: `[SERIE:${seriesId}:${series.name}]`,
                basedOnGenres: seriesDetails.genres.map((g: any) => g.name).join(', '),
                recommendations: topRecommendations,
                totalFound: uniqueResults.length
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar series similares"
        };
    }
}

/**
 * Obtener recomendaciones avanzadas basadas en múltiples películas o criterios complejos
 * Analiza géneros, directores, actores comunes y da recomendaciones más precisas
 */
async function getAdvancedRecommendations(movieTitles: string[]) {
    try {
        if (!movieTitles || movieTitles.length === 0) {
            return {
                success: false,
                error: "Debes proporcionar al menos una película"
            };
        }
        
        // Buscar todas las películas para obtener sus IDs y detalles
        const movieDetailsPromises = movieTitles.map(async (title) => {
            const searchResponse = await fetch(
                `${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(title)}`
            );
            const searchData = await searchResponse.json();
            
            if (searchData.results && searchData.results.length > 0) {
                const movieId = searchData.results[0].id;
                
                // Obtener detalles completos
                const detailsResponse = await fetch(
                    `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=es-ES&append_to_response=credits,keywords`
                );
                return await detailsResponse.json();
            }
            return null;
        });
        
        const moviesDetails = (await Promise.all(movieDetailsPromises)).filter(m => m !== null);
        
        if (moviesDetails.length === 0) {
            return {
                success: false,
                error: "No se encontraron las películas especificadas"
            };
        }
        
        // Analizar géneros comunes
        const genreCount: { [key: number]: number } = {};
        moviesDetails.forEach((movie: any) => {
            movie.genres.forEach((genre: any) => {
                genreCount[genre.id] = (genreCount[genre.id] || 0) + 1;
            });
        });
        
        // Obtener los géneros más comunes
        const topGenres = Object.entries(genreCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id]) => parseInt(id));
        
        // Analizar directores comunes
        const directorCount: { [key: number]: { count: number, name: string } } = {};
        moviesDetails.forEach((movie: any) => {
            const directors = movie.credits?.crew?.filter((c: any) => c.job === 'Director') || [];
            directors.forEach((director: any) => {
                if (!directorCount[director.id]) {
                    directorCount[director.id] = { count: 0, name: director.name };
                }
                directorCount[director.id].count += 1;
            });
        });
        
        // Buscar películas que coincidan con los géneros principales
        const genresQuery = topGenres.join(',');
        const discoverResponse = await fetch(
            `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=es-ES&with_genres=${genresQuery}&sort_by=vote_average.desc&vote_count.gte=500&page=1`
        );
        const discoverData = await discoverResponse.json();
        
        // Filtrar películas que no estén en la lista original
        const originalIds = moviesDetails.map((m: any) => m.id);
        let candidates = discoverData.results.filter((movie: any) => 
            !originalIds.includes(movie.id)
        );
        
        // Calcular puntuación de relevancia
        const scoredResults = candidates.map((movie: any) => {
            let score = movie.vote_average || 0;
            
            // Bonus por géneros compartidos con las películas base
            const sharedGenres = movie.genre_ids?.filter((g: number) => topGenres.includes(g)).length || 0;
            score += sharedGenres * 2;
            
            // Bonus por popularidad
            score += Math.log10(movie.popularity || 1) * 0.3;
            
            // Bonus si tiene alta valoración
            if (movie.vote_average >= 7.5) {
                score += 1.5;
            }
            
            return {
                ...movie,
                relevanceScore: score
            };
        });
        
        // Ordenar por puntuación
        scoredResults.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
        
        // Tomar las 12 mejores
        const topRecommendations = scoredResults.slice(0, 12).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                basedOnMovies: moviesDetails.map((m: any) => m.title).join(', '),
                commonGenres: moviesDetails[0]?.genres
                    .filter((g: any) => topGenres.includes(g.id))
                    .map((g: any) => g.name)
                    .join(', '),
                recommendations: topRecommendations
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al generar recomendaciones avanzadas"
        };
    }
}

/**
 * Obtener proveedores de streaming (plataformas)
 * Busca primero por nombre y luego obtiene las plataformas
 */
async function getStreamingProviders(title: string, type: 'movie' | 'tv' = 'tv') {
    try {
        // Primero buscar para obtener el ID
        const searchEndpoint = type === 'movie' ? 'search/movie' : 'search/tv';
        const searchResponse = await fetch(
            `${BASE_URL}/${searchEndpoint}?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(title)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró "${title}"`
            };
        }
        
        const item = searchData.results[0];
        const itemId = item.id;
        const itemTitle = type === 'movie' ? item.title : item.name;
        const formatted = type === 'movie' ? `[MOVIE:${itemId}:${itemTitle}]` : `[SERIE:${itemId}:${itemTitle}]`;
        
        // Obtener proveedores
        const providersResponse = await fetch(
            `${BASE_URL}/${type}/${itemId}/watch/providers?api_key=${API_KEY}`
        );
        const providersData = await providersResponse.json();
        
        const esProviders = providersData.results?.ES;
        
        if (!esProviders) {
            return {
                success: true,
                data: {
                    id: itemId,
                    title: itemTitle,
                    formatted: formatted,
                    platforms: 'No encontré información de streaming actualizada en TMDB para España',
                    hint: 'Te recomiendo buscar directamente en plataformas como Netflix, Prime Video, Disney+, HBO Max o Movistar+ para verificar su disponibilidad actual.'
                }
            };
        }
        
        const platforms: string[] = [];
        
        // Streaming (suscripción)
        if (esProviders.flatrate && esProviders.flatrate.length > 0) {
            platforms.push(...esProviders.flatrate.map((p: any) => p.provider_name));
        }
        
        // Alquiler
        const rentals = esProviders.rent ? esProviders.rent.map((p: any) => p.provider_name) : [];
        
        // Compra
        const buy = esProviders.buy ? esProviders.buy.map((p: any) => p.provider_name) : [];
        
        return {
            success: true,
            data: {
                id: itemId,
                title: itemTitle,
                formatted: formatted,
                platforms: platforms.length > 0 ? platforms.join(', ') : 'No disponible en streaming',
                rent: rentals.length > 0 ? rentals.join(', ') : null,
                buy: buy.length > 0 ? buy.join(', ') : null
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener plataformas de streaming"
        };
    }
}

/**
 * Buscar películas de un actor específico (opcionalmente filtradas por género)
 */
async function searchMoviesByActor(actorName: string, genreId?: number) {
    try {
        // Primero buscar el actor para obtener su ID
        const searchResponse = await fetch(
            `${BASE_URL}/search/person?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(actorName)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró el actor "${actorName}"`
            };
        }
        
        const actor = searchData.results[0];
        const actorId = actor.id;
        
        // Obtener películas del actor
        const moviesResponse = await fetch(
            `${BASE_URL}/person/${actorId}/movie_credits?api_key=${API_KEY}&language=es-ES`
        );
        const moviesData = await moviesResponse.json();
        
        let movies = moviesData.cast || [];
        
        // Filtrar por género si se especifica
        if (genreId) {
            movies = movies.filter((movie: any) => 
                movie.genre_ids && movie.genre_ids.includes(genreId)
            );
        }
        
        // Ordenar por popularidad y tomar las 10 más relevantes
        movies.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
        movies = movies.slice(0, 10);
        
        if (movies.length === 0) {
            return {
                success: false,
                error: genreId 
                    ? `No se encontraron películas de ${actor.name} en ese género`
                    : `No se encontraron películas de ${actor.name}`
            };
        }
        
        const formattedMovies = movies.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            character: movie.character,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                actor: actor.name,
                totalMovies: moviesData.cast?.length || 0,
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar películas del actor"
        };
    }
}

/**
 * Buscar películas de un director específico
 */
async function searchMoviesByDirector(directorName: string) {
    try {
        // Primero buscar el director para obtener su ID
        const searchResponse = await fetch(
            `${BASE_URL}/search/person?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(directorName)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró el director "${directorName}"`
            };
        }
        
        const director = searchData.results[0];
        const directorId = director.id;
        
        // Obtener películas del director
        const moviesResponse = await fetch(
            `${BASE_URL}/person/${directorId}/movie_credits?api_key=${API_KEY}&language=es-ES`
        );
        const moviesData = await moviesResponse.json();
        
        // Filtrar solo las películas donde es director
        let movies = (moviesData.crew || []).filter((movie: any) => 
            movie.job === "Director"
        );
        
        // Ordenar por fecha de lanzamiento (más recientes primero)
        movies.sort((a: any, b: any) => {
            const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
            const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
            return dateB - dateA;
        });
        
        movies = movies.slice(0, 15); // Más películas para directores
        
        if (movies.length === 0) {
            return {
                success: false,
                error: `No se encontraron películas dirigidas por ${director.name}`
            };
        }
        
        const formattedMovies = movies.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                director: director.name,
                totalMovies: movies.length,
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar películas del director"
        };
    }
}

/**
 * Obtener contenido en tendencia (trending)
 */
async function getTrendingContent(type: 'movie' | 'tv' | 'all' = 'all', timeWindow: 'day' | 'week' = 'week') {
    try {
        const response = await fetch(
            `${BASE_URL}/trending/${type}/${timeWindow}?api_key=${API_KEY}&language=es-ES`
        );
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return {
                success: false,
                error: "No se encontró contenido en tendencia"
            };
        }
        
        const trending = data.results.slice(0, 10).map((item: any) => {
            const isMovie = item.media_type === 'movie' || type === 'movie';
            return {
                id: item.id,
                title: isMovie ? item.title : item.name,
                media_type: item.media_type || type,
                release_date: isMovie ? item.release_date : item.first_air_date,
                vote_average: item.vote_average,
                popularity: item.popularity,
                formatted: isMovie 
                    ? `[MOVIE:${item.id}:${item.title}]` 
                    : `[SERIE:${item.id}:${item.name}]`
            };
        });
        
        return {
            success: true,
            data: {
                timeWindow: timeWindow === 'day' ? 'hoy' : 'esta semana',
                type: type === 'movie' ? 'películas' : type === 'tv' ? 'series' : 'películas y series',
                trending: trending
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener contenido en tendencia"
        };
    }
}

/**
 * Búsqueda avanzada por género y características
 */
async function searchByGenreAndKeywords(genreId: number, keywords?: string, minRating?: number) {
    try {
        let url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`;
        
        // Agregar rating mínimo si se especifica
        if (minRating) {
            url += `&vote_average.gte=${minRating}`;
        }
        
        // Si hay keywords, buscarlas primero
        if (keywords) {
            const keywordResponse = await fetch(
                `${BASE_URL}/search/keyword?api_key=${API_KEY}&query=${encodeURIComponent(keywords)}`
            );
            const keywordData = await keywordResponse.json();
            
            if (keywordData.results && keywordData.results.length > 0) {
                const keywordId = keywordData.results[0].id;
                url += `&with_keywords=${keywordId}`;
            }
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return {
                success: false,
                error: "No se encontraron películas con esos criterios"
            };
        }
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            overview: movie.overview,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                criteria: keywords || 'género específico',
                movies: movies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error en la búsqueda avanzada"
        };
    }
}

/**
 * Obtener series que tendrán nuevos episodios próximamente
 */
async function getUpcomingSeriesEpisodes() {
    try {
        const response = await fetch(
            `${BASE_URL}/tv/on_the_air?api_key=${API_KEY}&language=es-ES&region=ES`
        );
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return {
                success: false,
                error: "No se encontraron series con próximos episodios"
            };
        }
        
        const series = data.results.slice(0, 10).map((serie: any) => ({
            id: serie.id,
            name: serie.name,
            first_air_date: serie.first_air_date,
            vote_average: serie.vote_average,
            formatted: `[SERIE:${serie.id}:${serie.name}]`
        }));
        
        return {
            success: true,
            data: series
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener series con próximos episodios"
        };
    }
}

/**
 * Buscar películas por década
 */
async function searchByDecade(decade: number, genreId?: number) {
    try {
        const startYear = decade;
        const endYear = decade + 9;
        
        let url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=es-ES&sort_by=popularity.desc&primary_release_date.gte=${startYear}-01-01&primary_release_date.lte=${endYear}-12-31`;
        
        if (genreId) {
            url += `&with_genres=${genreId}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return {
                success: false,
                error: `No se encontraron películas de los ${decade}s`
            };
        }
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                decade: `${decade}s`,
                movies: movies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar películas por década"
        };
    }
}

/**
 * Obtener top películas/series por género específico
 */
async function getTopByGenre(genreId: number, type: 'movie' | 'tv' = 'movie') {
    try {
        const response = await fetch(
            `${BASE_URL}/discover/${type}?api_key=${API_KEY}&language=es-ES&sort_by=vote_average.desc&with_genres=${genreId}&vote_count.gte=100`
        );
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            return {
                success: false,
                error: `No se encontraron ${type === 'movie' ? 'películas' : 'series'} top de ese género`
            };
        }
        
        const items = data.results.slice(0, 10).map((item: any) => {
            const isMovie = type === 'movie';
            return {
                id: item.id,
                title: isMovie ? item.title : item.name,
                release_date: isMovie ? item.release_date : item.first_air_date,
                vote_average: item.vote_average,
                formatted: isMovie 
                    ? `[MOVIE:${item.id}:${item.title}]` 
                    : `[SERIE:${item.id}:${item.name}]`
            };
        });
        
        return {
            success: true,
            data: {
                type: type === 'movie' ? 'películas' : 'series',
                items: items
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener top por género"
        };
    }
}

/**
 * Obtener reseñas/opiniones de una película desde TMDB + OMDB (IMDB, Rotten Tomatoes, Metacritic)
 */
async function getMovieReviews(movieTitle: string, limit: number = 5) {
    try {
        // Primero buscar la película para obtener su ID y datos
        const searchResponse = await fetch(
            `${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(movieTitle)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró la película "${movieTitle}"`
            };
        }
        
        const movie = searchData.results[0];
        const movieId = movie.id;
        
        // Obtener detalles completos para tener el IMDB ID
        const detailsResponse = await fetch(
            `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=es-ES`
        );
        const detailsData = await detailsResponse.json();
        const imdbId = detailsData.imdb_id;
        
        // Obtener ratings de OMDB (IMDB, Rotten Tomatoes, Metacritic)
        let omdbRatings = null;
        if (imdbId) {
            try {
                const omdbResponse = await fetch(
                    `${OMDB_BASE_URL}/?apikey=${OMDB_API_KEY}&i=${imdbId}`
                );
                const omdbData = await omdbResponse.json();
                
                if (omdbData.Response === "True") {
                    omdbRatings = {
                        imdb: omdbData.imdbRating !== "N/A" ? omdbData.imdbRating : null,
                        imdbVotes: omdbData.imdbVotes !== "N/A" ? omdbData.imdbVotes : null,
                        rottenTomatoes: omdbData.Ratings?.find((r: any) => r.Source === "Rotten Tomatoes")?.Value || null,
                        metacritic: omdbData.Ratings?.find((r: any) => r.Source === "Metacritic")?.Value || null,
                        awards: omdbData.Awards !== "N/A" ? omdbData.Awards : null
                    };
                }
            } catch (error) {
                console.warn("No se pudieron obtener ratings de OMDB:", error);
            }
        }
        
        // Obtener reseñas de TMDB
        const reviewsResponse = await fetch(
            `${BASE_URL}/movie/${movieId}/reviews?api_key=${API_KEY}&language=es-ES`
        );
        const reviewsData = await reviewsResponse.json();
        
        // Si no hay reseñas en español, intentar en inglés
        let reviews = reviewsData.results || [];
        if (reviews.length === 0) {
            const reviewsEnResponse = await fetch(
                `${BASE_URL}/movie/${movieId}/reviews?api_key=${API_KEY}&language=en-US`
            );
            const reviewsEnData = await reviewsEnResponse.json();
            reviews = reviewsEnData.results || [];
        }
        
        // Limitar y formatear reseñas
        const limitedReviews = reviews.slice(0, limit).map((review: any) => ({
            author: review.author,
            rating: review.author_details?.rating || null,
            content: review.content.length > 500 ? review.content.substring(0, 500) + "..." : review.content,
            created_at: review.created_at,
            url: review.url
        }));
        
        return {
            success: true,
            data: {
                movie: movie.title,
                movieFormatted: `[MOVIE:${movieId}:${movie.title}]`,
                year: movie.release_date?.substring(0, 4),
                // Ratings oficiales (OMDB)
                ratings: omdbRatings,
                // Reseñas con texto (TMDB)
                totalReviews: reviews.length,
                showing: limitedReviews.length,
                reviews: limitedReviews,
                message: reviews.length === 0 ? "No hay reseñas de texto disponibles, pero se muestran los ratings oficiales" : null
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener reseñas de la película"
        };
    }
}

/**
 * Obtener reseñas/opiniones de una serie desde TMDB + OMDB (IMDB ratings)
 */
async function getSeriesReviews(seriesName: string, limit: number = 5) {
    try {
        // Primero buscar la serie para obtener su ID
        const searchResponse = await fetch(
            `${BASE_URL}/search/tv?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(seriesName)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró la serie "${seriesName}"`
            };
        }
        
        const series = searchData.results[0];
        const seriesId = series.id;
        
        // Obtener detalles externos (IMDB ID)
        const externalIdsResponse = await fetch(
            `${BASE_URL}/tv/${seriesId}/external_ids?api_key=${API_KEY}`
        );
        const externalIdsData = await externalIdsResponse.json();
        const imdbId = externalIdsData.imdb_id;
        
        // Obtener ratings de OMDB (IMDB principalmente, series no suelen tener RT/Metacritic)
        let omdbRatings = null;
        if (imdbId) {
            try {
                const omdbResponse = await fetch(
                    `${OMDB_BASE_URL}/?apikey=${OMDB_API_KEY}&i=${imdbId}`
                );
                const omdbData = await omdbResponse.json();
                
                if (omdbData.Response === "True") {
                    omdbRatings = {
                        imdb: omdbData.imdbRating !== "N/A" ? omdbData.imdbRating : null,
                        imdbVotes: omdbData.imdbVotes !== "N/A" ? omdbData.imdbVotes : null,
                        rottenTomatoes: omdbData.Ratings?.find((r: any) => r.Source === "Rotten Tomatoes")?.Value || null,
                        metacritic: omdbData.Ratings?.find((r: any) => r.Source === "Metacritic")?.Value || null,
                        awards: omdbData.Awards !== "N/A" ? omdbData.Awards : null,
                        seasons: omdbData.totalSeasons !== "N/A" ? omdbData.totalSeasons : null
                    };
                }
            } catch (error) {
                console.warn("No se pudieron obtener ratings de OMDB para la serie:", error);
            }
        }
        
        // Obtener reseñas de TMDB
        const reviewsResponse = await fetch(
            `${BASE_URL}/tv/${seriesId}/reviews?api_key=${API_KEY}&language=es-ES`
        );
        const reviewsData = await reviewsResponse.json();
        
        // Si no hay reseñas en español, intentar en inglés
        let reviews = reviewsData.results || [];
        if (reviews.length === 0) {
            const reviewsEnResponse = await fetch(
                `${BASE_URL}/tv/${seriesId}/reviews?api_key=${API_KEY}&language=en-US`
            );
            const reviewsEnData = await reviewsEnResponse.json();
            reviews = reviewsEnData.results || [];
        }
        
        // Limitar y formatear reseñas
        const limitedReviews = reviews.slice(0, limit).map((review: any) => ({
            author: review.author,
            rating: review.author_details?.rating || null,
            content: review.content.length > 500 ? review.content.substring(0, 500) + "..." : review.content,
            created_at: review.created_at,
            url: review.url
        }));
        
        return {
            success: true,
            data: {
                series: series.name,
                seriesFormatted: `[SERIE:${seriesId}:${series.name}]`,
                year: series.first_air_date?.substring(0, 4),
                // Ratings oficiales (OMDB)
                ratings: omdbRatings,
                // Reseñas con texto (TMDB)
                totalReviews: reviews.length,
                showing: limitedReviews.length,
                reviews: limitedReviews,
                message: reviews.length === 0 ? "No hay reseñas de texto disponibles, pero se muestran los ratings oficiales" : null
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener reseñas de la serie"
        };
    }
}

/**
 * Navegar a una página de la app
 */
async function navigateToPage(route: string): Promise<{ success: boolean; message: string }> {
    const routes: { [key: string]: string } = {
        "acción": "/catalogo/categorias?genre=28",
        "comedia": "/catalogo/categorias?genre=35",
        "drama": "/catalogo/categorias?genre=18",
        "terror": "/catalogo/categorias?genre=27",
        "ciencia ficción": "/catalogo/categorias?genre=878",
        "romance": "/catalogo/categorias?genre=10749",
        "populares": "/catalogo/maspopulares",
        "estrenos": "/catalogo/ultimoslanzamientos",
        "cartelera": "/catalogo/cartelera",
        "top películas": "/catalogo/topmovies",
        "top series": "/catalogo/topseries",
        "favoritos": "/personal/favoritos",
        "pendientes": "/personal/pendientes",
        "vistos": "/personal/vistos",
        "me gusta": "/personal/megusta"
    };

    const normalizedRoute = route.toLowerCase();
    const targetRoute = routes[normalizedRoute];

    if (targetRoute) {
        // En un componente React, usaremos window.location para navegar
        return {
            success: true,
            message: `NAVIGATE_TO:${targetRoute}`,
        };
    }

    return {
        success: false,
        message: "No se encontró la página solicitada"
    };
}

/**
 * Lista de funciones disponibles para la IA
 */
export const availableFunctions: AIFunction[] = [
    {
        name: "searchMovie",
        description: "Busca información actualizada de una película en TMDB",
        parameters: { title: "string" },
        execute: searchMovie
    },
    {
        name: "searchSeries",
        description: "Busca información actualizada de una serie en TMDB",
        parameters: { name: "string" },
        execute: searchSeries
    },
    {
        name: "getSimilarMovies",
        description: "Obtiene películas similares combinando recommendations y similar. Usa algoritmo de scoring avanzado con géneros compartidos.",
        parameters: { movieTitle: "string" },
        execute: getSimilarMovies
    },
    {
        name: "getSimilarSeries",
        description: "Obtiene series similares combinando recommendations y similar. Usa algoritmo de scoring avanzado con géneros compartidos.",
        parameters: { seriesName: "string" },
        execute: getSimilarSeries
    },
    {
        name: "getAdvancedRecommendations",
        description: "Genera recomendaciones avanzadas basadas en MÚLTIPLES películas analizando géneros y características comunes. Úsala cuando el usuario mencione varias películas que le gusten.",
        parameters: { movieTitles: "array de strings (ej: [\"Interstellar\", \"The Martian\", \"Arrival\"])" },
        execute: getAdvancedRecommendations
    },
    {
        name: "searchMoviesByActor",
        description: "Busca películas de un actor específico, opcionalmente filtradas por género",
        parameters: { actorName: "string", genreId: "number (opcional)" },
        execute: searchMoviesByActor
    },
    {
        name: "searchMoviesByDirector",
        description: "Busca películas dirigidas por un director específico",
        parameters: { directorName: "string" },
        execute: searchMoviesByDirector
    },
    {
        name: "getTrendingContent",
        description: "Obtiene el contenido más popular del momento (trending)",
        parameters: { type: "'movie' | 'tv' | 'all' (por defecto 'all')", timeWindow: "'day' | 'week' (por defecto 'week')" },
        execute: getTrendingContent
    },
    {
        name: "searchByGenreAndKeywords",
        description: "Búsqueda avanzada de películas por género y características específicas (keywords)",
        parameters: { genreId: "number", keywords: "string (opcional)", minRating: "number (opcional)" },
        execute: searchByGenreAndKeywords
    },
    {
        name: "searchInFavoriteMovies",
        description: "Busca en las películas favoritas del usuario. Puede buscar por título o género. ÚSALA cuando el usuario pregunte por sus películas favoritas.",
        parameters: { searchQuery: "string (opcional - título o género)", limit: "number (opcional, por defecto 20)" },
        execute: searchInFavoriteMovies
    },
    {
        name: "searchInFavoriteSeries",
        description: "Busca en las series favoritas del usuario. Puede buscar por título o género. ÚSALA cuando el usuario pregunte por sus series favoritas.",
        parameters: { searchQuery: "string (opcional - título o género)", limit: "number (opcional, por defecto 20)" },
        execute: searchInFavoriteSeries
    },
    {
        name: "searchInPendingMovies",
        description: "Busca en las películas pendientes del usuario. ÚSALA cuando pregunten qué tienen pendiente de ver.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInPendingMovies
    },
    {
        name: "searchInPendingSeries",
        description: "Busca en las series pendientes del usuario. ÚSALA cuando pregunten por series pendientes.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInPendingSeries
    },
    {
        name: "searchInWatchedMovies",
        description: "Busca en las películas vistas del usuario. ÚSALA cuando pregunten qué han visto.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInWatchedMovies
    },
    {
        name: "searchInWatchedSeries",
        description: "Busca en las series vistas del usuario. ÚSALA cuando pregunten por series que han visto.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInWatchedSeries
    },
    {
        name: "searchInLikedMovies",
        description: "Busca en las películas que le gustan al usuario (marcadas con 'me gusta'). ÚSALA cuando pregunten por películas que les gustan.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInLikedMovies
    },
    {
        name: "searchInLikedSeries",
        description: "Busca en las series que le gustan al usuario (marcadas con 'me gusta'). ÚSALA cuando pregunten por series que les gustan.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInLikedSeries
    },
    {
        name: "searchInFavoriteActors",
        description: "Busca en los actores favoritos del usuario. ÚSALA cuando pregunten por sus actores favoritos.",
        parameters: { searchQuery: "string (opcional)", limit: "number (opcional, por defecto 20)" },
        execute: searchInFavoriteActors
    },
    {
        name: "getUserListsStats",
        description: "Obtiene estadísticas de todas las listas del usuario (cuántas películas/series tiene en cada lista). ÚSALA para resúmenes generales.",
        parameters: {},
        execute: getUserListsStats
    },
    {
        name: "getMovieReviews",
        description: "Obtiene ratings oficiales (IMDB, Rotten Tomatoes, Metacritic) + reseñas con texto de usuarios. ÚSALA cuando pregunten por opiniones, ratings o reseñas de una película.",
        parameters: { movieTitle: "string", limit: "number (opcional, por defecto 5)" },
        execute: getMovieReviews
    },
    {
        name: "getSeriesReviews",
        description: "Obtiene ratings oficiales (IMDB principalmente) + reseñas con texto de usuarios. ÚSALA cuando pregunten por opiniones, ratings o reseñas de una serie.",
        parameters: { seriesName: "string", limit: "number (opcional, por defecto 5)" },
        execute: getSeriesReviews
    },
    {
        name: "getUpcomingSeriesEpisodes",
        description: "Obtiene series que tendrán nuevos episodios próximamente",
        parameters: {},
        execute: getUpcomingSeriesEpisodes
    },
    {
        name: "searchByDecade",
        description: "Busca películas de una década específica, opcionalmente filtradas por género",
        parameters: { decade: "number (ej: 1980, 1990, 2000)", genreId: "number (opcional)" },
        execute: searchByDecade
    },
    {
        name: "getTopByGenre",
        description: "Obtiene las mejores películas o series de un género específico",
        parameters: { genreId: "number", type: "'movie' | 'tv' (por defecto 'movie')" },
        execute: getTopByGenre
    },
    {
        name: "getSeriesDetails",
        description: "Obtiene detalles de una serie incluyendo siguiente episodio y temporadas",
        parameters: { seriesId: "number" },
        execute: getSeriesDetails
    },
    {
        name: "getMoviesInTheaters",
        description: "Obtiene las películas que están actualmente en cartelera",
        parameters: {},
        execute: getMoviesInTheaters
    },
    {
        name: "getUpcomingMovies",
        description: "Obtiene los próximos estrenos de cine",
        parameters: {},
        execute: getUpcomingMovies
    },
    {
        name: "getStreamingProviders",
        description: "Busca dónde ver una película o serie (plataformas de streaming, alquiler, compra). Busca automáticamente por nombre.",
        parameters: { title: "string (nombre de la película/serie)", type: "'movie' | 'tv' (por defecto 'tv')" },
        execute: getStreamingProviders
    },
    {
        name: "navigateToPage",
        description: "Navega a una sección específica de la aplicación",
        parameters: { route: "string (ej: 'acción', 'populares', 'favoritos')" },
        execute: navigateToPage
    }
];

/**
 * Genera el contexto de funciones disponibles para la IA
 */
export function getFunctionsContext(): string {
    let context = "\n\n# 🔧 IMPORTANTE - Funciones disponibles:\n\n";
    context += "Tienes acceso a estas funciones para obtener información en tiempo real:\n\n";
    
    context += "## 📺 Búsqueda de contenido:\n\n";
    
    context += "1. **getStreamingProviders(title, type)**: Busca dónde ver una película/serie\n";
    context += "   - Ejemplo: USE_FUNCTION: getStreamingProviders(\"Breaking Bad\", \"tv\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getStreamingProviders(\"Inception\", \"movie\")\n\n";
    
    context += "2. **getSimilarMovies(movieTitle)**: 🌟 MEJORADA - Busca películas similares\n";
    context += "   - Combina recommendations + similar de TMDB\n";
    context += "   - Usa algoritmo de scoring: géneros compartidos + valoración + popularidad\n";
    context += "   - Ejemplo: USE_FUNCTION: getSimilarMovies(\"Interstellar\")\n";
    context += "   - ⚠️ ÚSALA cuando pidan películas \"similares\", \"como\", \"del estilo de\"\n\n";
    
    context += "3. **getSimilarSeries(seriesName)**: 🌟 MEJORADA - Busca series similares\n";
    context += "   - Combina recommendations + similar de TMDB\n";
    context += "   - Usa algoritmo de scoring avanzado\n";
    context += "   - Ejemplo: USE_FUNCTION: getSimilarSeries(\"Breaking Bad\")\n\n";
    
    context += "4. **getAdvancedRecommendations(movieTitles)**: 🆕 NUEVA - Recomendaciones basadas en MÚLTIPLES películas\n";
    context += "   - Analiza géneros y patrones comunes entre varias películas\n";
    context += "   - Da recomendaciones MUY precisas\n";
    context += "   - Ejemplo: USE_FUNCTION: getAdvancedRecommendations([\"Interstellar\", \"The Martian\", \"Arrival\"])\n";
    context += "   - ⚠️ ÚSALA cuando el usuario mencione que le gustaron VARIAS películas\n\n";
    
    context += "5. **searchMoviesByActor(actorName, genreId)**: Películas de un actor\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByActor(\"Tom Cruise\", 28)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByActor(\"Scarlett Johansson\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de un actor específico\n\n";
    
    context += "6. **searchMoviesByDirector(directorName)**: Películas de un director\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByDirector(\"Christopher Nolan\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de un director\n\n";
    
    context += "7. **getTrendingContent(type, timeWindow)**: Contenido más popular\n";
    context += "   - Ejemplo: USE_FUNCTION: getTrendingContent(\"all\", \"week\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getTrendingContent(\"movie\", \"day\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten qué es popular, trending, o de moda\n\n";
    
    context += "8. **searchByGenreAndKeywords(genreId, keywords, minRating)**: Búsqueda avanzada\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByGenreAndKeywords(878, \"time travel\", 7)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByGenreAndKeywords(27, \"zombies\")\n";
    context += "   - ⚠️ ÚSALA para películas con características específicas\n";
    context += "   - Géneros: Acción=28, Comedia=35, Drama=18, Terror=27, Ciencia Ficción=878, Romance=10749\n\n";
    
    context += "9. **searchByDecade(decade, genreId)**: Películas de una época\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByDecade(1980, 27)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByDecade(1990)\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de los 80s, 90s, etc.\n\n";
    
    context += "10. **getTopByGenre(genreId, type)**: Top películas/series por género\n";
    context += "   - Ejemplo: USE_FUNCTION: getTopByGenre(35, \"movie\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getTopByGenre(18, \"tv\")\n";
    context += "   - ⚠️ ÚSALA para \"mejores películas de comedia\", \"top series de drama\", etc.\n\n";
    
    context += "## 👤 Búsqueda en listas personales del usuario:\n\n";
    
    context += "⚠️ IMPORTANTE: Estas funciones acceden a las listas COMPLETAS (no solo las 5 del contexto inicial)\n";
    context += "⚠️ Cuando pregunten \"¿Cuáles son mis favoritas?\" DEBES usar estas funciones, NO el contexto inicial\n\n";
    
    context += "11. **searchInFavoriteMovies(searchQuery, limit)**: 🔍 Busca en favoritos de películas\n";
    context += "   - limit por defecto: 20 (puedes pedir más con limit=50)\n";
    context += "   - Para todas las favoritas sin filtro: USE_FUNCTION: searchInFavoriteMovies()\n";
    context += "   - Con límite específico: USE_FUNCTION: searchInFavoriteMovies(undefined, 30)\n";
    context += "   - Buscando algo: USE_FUNCTION: searchInFavoriteMovies(\"Harry Potter\", 20)\n";
    context += "   - ⚠️ ÚSALA SIEMPRE cuando pregunten \"¿Cuáles son mis películas favoritas?\"\n";
    context += "   - ⚠️ Si piden \"10 más\", explica que puedes mostrar las siguientes aumentando el limit\n\n";
    
    context += "12. **searchInFavoriteSeries(searchQuery, limit)**: 🔍 Busca en favoritos de series\n";
    context += "   - limit por defecto: 20\n";
    context += "   - Para todas las favoritas sin filtro: USE_FUNCTION: searchInFavoriteSeries()\n";
    context += "   - Con límite específico: USE_FUNCTION: searchInFavoriteSeries(undefined, 30)\n";
    context += "   - Buscando algo: USE_FUNCTION: searchInFavoriteSeries(\"Witcher\")\n";
    context += "   - ⚠️ ÚSALA SIEMPRE cuando pregunten \"¿Cuáles son mis series favoritas?\"\n\n";
    
    context += "13. **searchInPendingMovies(searchQuery, limit)**: 🔍 Busca en películas pendientes\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInPendingMovies()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten qué tienen pendiente de ver\n\n";
    
    context += "14. **searchInPendingSeries(searchQuery, limit)**: 🔍 Busca en series pendientes\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInPendingSeries()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por series pendientes\n\n";
    
    context += "15. **searchInWatchedMovies(searchQuery, limit)**: 🔍 Busca en películas vistas\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInWatchedMovies()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten qué han visto\n\n";
    
    context += "16. **searchInWatchedSeries(searchQuery, limit)**: 🔍 Busca en series vistas\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInWatchedSeries()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por series que han visto\n\n";
    
    context += "17. **searchInLikedMovies(searchQuery, limit)**: 💚 Busca en películas que le gustan\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInLikedMovies(\"Marvel\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas marcadas como 'me gusta'\n\n";
    
    context += "18. **searchInLikedSeries(searchQuery, limit)**: 💚 Busca en series que le gustan\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInLikedSeries()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por series marcadas como 'me gusta'\n\n";
    
    context += "19. **searchInFavoriteActors(searchQuery, limit)**: ⭐ Busca en actores favoritos\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInFavoriteActors(\"Tom\")\n";
    context += "   - Ejemplo: USE_FUNCTION: searchInFavoriteActors()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por sus actores favoritos\n\n";
    
    context += "20. **getUserListsStats()**: 📊 Estadísticas de todas las listas\n";
    context += "   - Ejemplo: USE_FUNCTION: getUserListsStats()\n";
    context += "   - ⚠️ ÚSALA para resúmenes: \"Cuántas películas tengo\", \"Mis estadísticas\"\n\n";
    
    context += "## 💬 Reseñas y opiniones (IMDB + Rotten Tomatoes + Metacritic + TMDB):\n\n";
    
    context += "21. **getMovieReviews(movieTitle, limit)**: 📝 Obtiene ratings oficiales + reseñas\n";
    context += "   - Ratings de IMDB, Rotten Tomatoes, Metacritic (vía OMDB)\n";
    context += "   - Reseñas con texto de usuarios (vía TMDB)\n";
    context += "   - Ejemplo: USE_FUNCTION: getMovieReviews(\"The Witcher\", 5)\n";
    context += "   - Ejemplo: USE_FUNCTION: getMovieReviews(\"Interstellar\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por opiniones, ratings o reseñas de una película\n\n";
    
    context += "22. **getSeriesReviews(seriesName, limit)**: 📝 Obtiene ratings oficiales + reseñas\n";
    context += "   - Ratings de IMDB (y RT/Metacritic si disponibles)\n";
    context += "   - Reseñas con texto de usuarios (vía TMDB)\n";
    context += "   - Ejemplo: USE_FUNCTION: getSeriesReviews(\"The Witcher\", 5)\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por opiniones, ratings o reseñas de una serie\n\n";
    
    context += "## 🎬 Otras funciones de búsqueda:\n\n";
    
    context += "2. **getSimilarMovies(movieTitle)**: Busca películas similares\n";
    context += "   - Ejemplo: USE_FUNCTION: getSimilarMovies(\"Interstellar\")\n";
    context += "   - ⚠️ ÚSALA cuando pidan películas \"similares\", \"como\", \"del estilo de\"\n\n";
    
    context += "3. **getSimilarSeries(seriesName)**: Busca series similares\n";
    context += "   - Ejemplo: USE_FUNCTION: getSimilarSeries(\"Breaking Bad\")\n\n";
    
    context += "4. **searchMoviesByActor(actorName, genreId)**: Películas de un actor\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByActor(\"Tom Cruise\", 28)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByActor(\"Scarlett Johansson\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de un actor específico\n\n";
    
    context += "5. **searchMoviesByDirector(directorName)**: Películas de un director\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMoviesByDirector(\"Christopher Nolan\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de un director\n\n";
    
    context += "6. **getTrendingContent(type, timeWindow)**: Contenido más popular\n";
    context += "   - Ejemplo: USE_FUNCTION: getTrendingContent(\"all\", \"week\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getTrendingContent(\"movie\", \"day\")\n";
    context += "   - ⚠️ ÚSALA cuando pregunten qué es popular, trending, o de moda\n\n";
    
    context += "7. **searchByGenreAndKeywords(genreId, keywords, minRating)**: Búsqueda avanzada\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByGenreAndKeywords(878, \"time travel\", 7)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByGenreAndKeywords(27, \"zombies\")\n";
    context += "   - ⚠️ ÚSALA para películas con características específicas\n";
    context += "   - Géneros: Acción=28, Comedia=35, Drama=18, Terror=27, Ciencia Ficción=878, Romance=10749\n\n";
    
    context += "8. **searchByDecade(decade, genreId)**: Películas de una época\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByDecade(1980, 27)\n";
    context += "   - Ejemplo: USE_FUNCTION: searchByDecade(1990)\n";
    context += "   - ⚠️ ÚSALA cuando pregunten por películas de los 80s, 90s, etc.\n\n";
    
    context += "9. **getTopByGenre(genreId, type)**: Top películas/series por género\n";
    context += "   - Ejemplo: USE_FUNCTION: getTopByGenre(35, \"movie\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getTopByGenre(18, \"tv\")\n";
    context += "   - ⚠️ ÚSALA para \"mejores películas de comedia\", \"top series de drama\", etc.\n\n";
    
    context += "## 🎬 Información y estrenos:\n\n";
    
    context += "10. **getMoviesInTheaters()**: Películas en cartelera\n";
    context += "   - Ejemplo: USE_FUNCTION: getMoviesInTheaters()\n\n";
    
    context += "11. **getUpcomingMovies()**: Próximos estrenos de cine\n";
    context += "   - Ejemplo: USE_FUNCTION: getUpcomingMovies()\n\n";
    
    context += "12. **getUpcomingSeriesEpisodes()**: Series con próximos episodios\n";
    context += "   - Ejemplo: USE_FUNCTION: getUpcomingSeriesEpisodes()\n";
    context += "   - ⚠️ ÚSALA cuando pregunten qué series están en emisión\n\n";
    
    context += "13. **searchMovie(title)**: Buscar info de una película\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMovie(\"Oppenheimer\")\n\n";
    
    context += "14. **searchSeries(name)**: Buscar info de una serie\n";
    context += "   - Ejemplo: USE_FUNCTION: searchSeries(\"Game of Thrones\")\n\n";
    
    context += "15. **getSeriesDetails(seriesId)**: Detalles de una serie (necesitas el ID)\n";
    context += "   - Ejemplo: Primero busca con searchSeries, luego usa el ID\n\n";
    
    context += "## 🧭 Navegación:\n\n";
    
    context += "16. **navigateToPage(route)**: Llevar al usuario a una sección\n";
    context += "   - Rutas: acción, comedia, drama, terror, ciencia ficción, romance, populares, estrenos, cartelera, top películas, top series, favoritos, pendientes, vistos, me gusta\n";
    context += "   - Ejemplo: USE_FUNCTION: navigateToPage(\"acción\")\n\n";
    
    context += "## ⚠️ REGLAS IMPORTANTES:\n\n";
    context += "- SIEMPRE usa estas funciones cuando el usuario pregunte algo que requiera datos de TMDB\n";
    context += "- Para recomendaciones similares, usa getSimilarMovies/getSimilarSeries\n";
    context += "- Para películas de actores/directores, usa las funciones específicas\n";
    context += "- Para contenido trending/popular, usa getTrendingContent\n";
    context += "- Para búsquedas con características específicas, usa searchByGenreAndKeywords\n";
    context += "- El formato debe ser EXACTAMENTE: USE_FUNCTION: nombreFuncion(parametro1, parametro2)\n";
    context += "- Los strings van entre comillas dobles, los números sin comillas\n\n";
    
    context += "## 🎬 FORMATO DE RESPUESTAS:\n\n";
    context += "- Cuando menciones películas/series, usa el formato [MOVIE:id:título] o [SERIE:id:título]\n";
    context += "- Las funciones devuelven este formato en el campo 'formatted'\n";
    context += "- Ejemplo: 'Te recomiendo [MOVIE:123:Inception]' en lugar de 'Te recomiendo Inception'\n";
    context += "- Esto crea badges clickeables para el usuario\n\n";
    
    return context;
}

/**
 * Ejecuta una función basada en el nombre y parámetros
 */
export async function executeFunction(functionName: string, params: any[]): Promise<any> {
    const func = availableFunctions.find(f => f.name === functionName);
    if (func) {
        return await func.execute(...params);
    }
    return { success: false, error: "Función no encontrada" };
}
