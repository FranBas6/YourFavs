import { type Movie } from "../../../types/ApiMovie.ts";
import { tmdbFetch, tmdbFetchList } from '../shared/tmdbClient';
import { fetchByProvider, getMostPopular, getTopRated, searchByTitle, PROVIDERS } from '../shared/tmdbDiscoverService';

// --- Fetch de detalles (específico de movies por el endpoint) ---

export const fetchMovieDetails = async (id: string | number) => {
    try {
        return await tmdbFetch<any>(`/movie/${id}`);
    } catch (error) {
        console.error(`❌ Error al obtener detalles de película ID ${id}:`, error);
        return null;
    }
};

// --- Funciones únicas de películas ---

export const getLatestMovies = async ({ page }: { page?: string }): Promise<Movie[]> => {
    const pageNumber = page || "1";

    try {
        const movies = await tmdbFetchList<Movie>('/movie/now_playing', { page: pageNumber });

        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(today.getDate() + 7);

        const filteredMovies = movies.filter((movie) => {
            if (!movie.release_date) return false;
            const releaseDate = new Date(movie.release_date);
            return releaseDate <= oneWeekLater;
        });

        return filteredMovies.sort((a, b) => {
            if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            const dateA = new Date(a.release_date || "");
            const dateB = new Date(b.release_date || "");
            return dateB.getTime() - dateA.getTime();
        });
    } catch (error) {
        console.error("Error al obtener las películas:", error);
        return [];
    }
};

export const getNowPlayingMoviesInSpain = async ({ page }: { page?: string }): Promise<Movie[]> => {
    const pageNumber = page || "1";

    try {
        const movies = await tmdbFetchList<Movie>('/movie/now_playing', { page: pageNumber, region: 'ES' });

        return movies.sort((a, b) => {
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
            const dateA = new Date(a.release_date || "");
            const dateB = new Date(b.release_date || "");
            return dateB.getTime() - dateA.getTime();
        });
    } catch (error) {
        console.error("Error al obtener las películas en cartelera en España:", error);
        return [];
    }
};

// --- Categorías (lógica única: "upcoming") ---

import { MOVIE_GENRE_SLUGS as genreMap } from '../../../utils/constants/genreSlugs';

const isUpcomingMovie = (releaseDate: string): boolean => {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    return new Date(releaseDate) >= oneMonthAgo;
};

export const getMoviesByCategory = async (category: string, page: string = "1"): Promise<Movie[]> => {
    const normalizedCategory = category.trim().toLowerCase();
    const genreOrUpcoming = genreMap[normalizedCategory];

    if (!genreOrUpcoming) {
        throw new Error(`Categoría no válida: ${category}`);
    }

    try {
        let movies: Movie[];

        if (genreOrUpcoming === "upcoming") {
            movies = await tmdbFetchList<Movie>('/movie/upcoming', {
                page,
                sort_by: 'popularity.desc',
            });
            movies = movies.filter(movie => movie.release_date && isUpcomingMovie(movie.release_date));
        } else {
            movies = await tmdbFetchList<Movie>('/discover/movie', {
                with_genres: genreOrUpcoming.toString(),
                sort_by: 'popularity.desc',
                'vote_count.gte': '100',
                page,
            });
        }

        return movies.sort((a, b) => {
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            return b.vote_average - a.vote_average;
        });
    } catch (error) {
        console.error("Error al obtener las películas:", error);
        return [];
    }
};

// --- Funciones delegadas a módulos compartidos ---

export const getMostPopularMovies = async ({ page }: { page?: string }): Promise<Movie[]> =>
    getMostPopular<Movie>('movie', page);

export const getTopRatedMovies = async ({ page }: { page?: string }): Promise<Movie[]> =>
    getTopRated<Movie>('movie', page);

export const getMoviesByTitle = async ({ title, page }: { title: string; page?: string }): Promise<Movie[]> =>
    searchByTitle<Movie>('movie', title, page);

export const getNetflixMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.NETFLIX, page);
export const getAmazonPrimeMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.AMAZON, page);
export const getDisneyPlusMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.DISNEY, page);
export const getHBOMaxMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.HBO, page);
export const getAppleTVMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.APPLE, page);
export const getMovistarPlusMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.MOVISTAR, page);
export const getFilminMovies = async (page?: string) => fetchByProvider<Movie>('movie', PROVIDERS.FILMIN, page);
