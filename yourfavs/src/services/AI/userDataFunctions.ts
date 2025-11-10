/**
 * Funciones para que la IA consulte datos personales del usuario
 * Estas funciones acceden a Firebase y permiten búsquedas en las listas del usuario
 */

import { getMovieFav, getMoviesPendientes, getMoviesVistas, getLikedMovies } from "../BD/yourfavsMovie";
import { getSerieFav, getSeriesPendientes, getSeriesVistas, getLikedSeries } from "../BD/yourfavsSerie";
import { getActorsFav } from "../BD/yourfavsActor";

/**
 * Buscar en las películas favoritas del usuario
 */
export async function searchInFavoriteMovies(searchQuery?: string, limit: number = 20) {
    try {
        const favoritas = await getMovieFav();
        
        if (!favoritas || favoritas.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    movies: [],
                    message: "No tienes películas en favoritos"
                }
            };
        }
        
        let results = favoritas;
        
        // Si hay búsqueda, filtrar
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = favoritas.filter((movie: any) => {
                const titleMatch = movie.title?.toLowerCase().includes(query);
                const genresMatch = movie.genres?.some((g: string) => g.toLowerCase().includes(query));
                return titleMatch || genresMatch;
            });
        }
        
        // Limitar resultados
        const limitedResults = results.slice(0, limit);
        
        const formattedMovies = limitedResults.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            genres: movie.genres,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                total: favoritas.length,
                found: results.length,
                showing: formattedMovies.length,
                searchQuery: searchQuery || 'todas',
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en películas favoritas"
        };
    }
}

/**
 * Buscar en las series favoritas del usuario
 */
export async function searchInFavoriteSeries(searchQuery?: string, limit: number = 20) {
    try {
        const favoritas = await getSerieFav();
        
        if (!favoritas || favoritas.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    series: [],
                    message: "No tienes series en favoritos"
                }
            };
        }
        
        let results = favoritas;
        
        // Si hay búsqueda, filtrar
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = favoritas.filter((serie: any) => {
                const nameMatch = serie.name?.toLowerCase().includes(query);
                const genresMatch = serie.genres?.some((g: string) => g.toLowerCase().includes(query));
                return nameMatch || genresMatch;
            });
        }
        
        // Limitar resultados
        const limitedResults = results.slice(0, limit);
        
        const formattedSeries = limitedResults.map((serie: any) => ({
            id: serie.id,
            name: serie.name,
            first_air_date: serie.first_air_date,
            genres: serie.genres,
            formatted: `[SERIE:${serie.id}:${serie.name}]`
        }));
        
        return {
            success: true,
            data: {
                total: favoritas.length,
                found: results.length,
                showing: formattedSeries.length,
                searchQuery: searchQuery || 'todas',
                series: formattedSeries
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en series favoritas"
        };
    }
}

/**
 * Buscar en películas pendientes del usuario
 */
export async function searchInPendingMovies(searchQuery?: string, limit: number = 20) {
    try {
        const pendientes = await getMoviesPendientes();
        
        if (!pendientes || pendientes.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    movies: [],
                    message: "No tienes películas pendientes"
                }
            };
        }
        
        let results = pendientes;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = pendientes.filter((movie: any) => 
                movie.title?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedMovies = limitedResults.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                total: pendientes.length,
                found: results.length,
                showing: formattedMovies.length,
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en películas pendientes"
        };
    }
}

/**
 * Buscar en películas vistas del usuario
 */
export async function searchInWatchedMovies(searchQuery?: string, limit: number = 20) {
    try {
        const vistas = await getMoviesVistas();
        
        if (!vistas || vistas.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    movies: [],
                    message: "No tienes películas vistas"
                }
            };
        }
        
        let results = vistas;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = vistas.filter((movie: any) => 
                movie.title?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedMovies = limitedResults.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            opinion: movie.opinion,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                total: vistas.length,
                found: results.length,
                showing: formattedMovies.length,
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en películas vistas"
        };
    }
}

/**
 * Buscar en series pendientes del usuario
 */
export async function searchInPendingSeries(searchQuery?: string, limit: number = 20) {
    try {
        const pendientes = await getSeriesPendientes();
        
        if (!pendientes || pendientes.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    series: [],
                    message: "No tienes series pendientes"
                }
            };
        }
        
        let results = pendientes;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = pendientes.filter((serie: any) => 
                serie.name?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedSeries = limitedResults.map((serie: any) => ({
            id: serie.id,
            name: serie.name,
            first_air_date: serie.first_air_date,
            formatted: `[SERIE:${serie.id}:${serie.name}]`
        }));
        
        return {
            success: true,
            data: {
                total: pendientes.length,
                found: results.length,
                showing: formattedSeries.length,
                series: formattedSeries
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en series pendientes"
        };
    }
}

/**
 * Buscar en series vistas del usuario
 */
export async function searchInWatchedSeries(searchQuery?: string, limit: number = 20) {
    try {
        const vistas = await getSeriesVistas();
        
        if (!vistas || vistas.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    series: [],
                    message: "No tienes series vistas"
                }
            };
        }
        
        let results = vistas;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = vistas.filter((serie: any) => 
                serie.name?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedSeries = limitedResults.map((serie: any) => ({
            id: serie.id,
            name: serie.name,
            opinion: serie.opinion,
            formatted: `[SERIE:${serie.id}:${serie.name}]`
        }));
        
        return {
            success: true,
            data: {
                total: vistas.length,
                found: results.length,
                showing: formattedSeries.length,
                series: formattedSeries
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en series vistas"
        };
    }
}

/**
 * Buscar en películas que le gustan al usuario (me gusta)
 */
export async function searchInLikedMovies(searchQuery?: string, limit: number = 20) {
    try {
        const liked = await getLikedMovies();
        
        if (!liked || liked.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    movies: [],
                    message: "No tienes películas marcadas como 'me gusta'"
                }
            };
        }
        
        let results = liked;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = liked.filter((movie: any) => 
                movie.title?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedMovies = limitedResults.map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: {
                total: liked.length,
                found: results.length,
                showing: formattedMovies.length,
                movies: formattedMovies
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en películas 'me gusta'"
        };
    }
}

/**
 * Buscar en series que le gustan al usuario (me gusta)
 */
export async function searchInLikedSeries(searchQuery?: string, limit: number = 20) {
    try {
        const liked = await getLikedSeries();
        
        if (!liked || liked.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    series: [],
                    message: "No tienes series marcadas como 'me gusta'"
                }
            };
        }
        
        let results = liked;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = liked.filter((serie: any) => 
                serie.name?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedSeries = limitedResults.map((serie: any) => ({
            id: serie.id,
            name: serie.name,
            first_air_date: serie.first_air_date,
            formatted: `[SERIE:${serie.id}:${serie.name}]`
        }));
        
        return {
            success: true,
            data: {
                total: liked.length,
                found: results.length,
                showing: formattedSeries.length,
                series: formattedSeries
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en series 'me gusta'"
        };
    }
}

/**
 * Buscar en actores favoritos del usuario
 */
export async function searchInFavoriteActors(searchQuery?: string, limit: number = 20) {
    try {
        const actors = await getActorsFav();
        
        if (!actors || actors.length === 0) {
            return {
                success: true,
                data: {
                    total: 0,
                    actors: [],
                    message: "No tienes actores favoritos"
                }
            };
        }
        
        let results = actors;
        
        if (searchQuery && searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            results = actors.filter((actor: any) => 
                actor.name?.toLowerCase().includes(query)
            );
        }
        
        const limitedResults = results.slice(0, limit);
        
        const formattedActors = limitedResults.map((actor: any) => ({
            id: actor.id,
            name: actor.name,
            known_for_department: actor.known_for_department,
            formatted: `[ACTOR:${actor.id}:${actor.name}]`
        }));
        
        return {
            success: true,
            data: {
                total: actors.length,
                found: results.length,
                showing: formattedActors.length,
                actors: formattedActors
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al buscar en actores favoritos"
        };
    }
}

/**
 * Obtener estadísticas de las listas del usuario
 */
export async function getUserListsStats() {
    try {
        const [moviesFav, seriesFav, moviesPending, seriesPending, moviesWatched, seriesWatched, moviesLiked, seriesLiked, actors] = await Promise.all([
            getMovieFav(),
            getSerieFav(),
            getMoviesPendientes(),
            getSeriesPendientes(),
            getMoviesVistas(),
            getSeriesVistas(),
            getLikedMovies(),
            getLikedSeries(),
            getActorsFav()
        ]);
        
        return {
            success: true,
            data: {
                moviesFavoritas: moviesFav?.length || 0,
                seriesFavoritas: seriesFav?.length || 0,
                moviesPendientes: moviesPending?.length || 0,
                seriesPendientes: seriesPending?.length || 0,
                moviesVistas: moviesWatched?.length || 0,
                seriesVistas: seriesWatched?.length || 0,
                moviesMeGusta: moviesLiked?.length || 0,
                seriesMeGusta: seriesLiked?.length || 0,
                actoresFavoritos: actors?.length || 0,
                totalPeliculas: (moviesFav?.length || 0) + (moviesPending?.length || 0) + (moviesWatched?.length || 0),
                totalSeries: (seriesFav?.length || 0) + (seriesPending?.length || 0) + (seriesWatched?.length || 0)
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener estadísticas"
        };
    }
}
