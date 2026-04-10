import { type Serie } from "../../../types/ApiSerie.ts";
import { tmdbFetchList } from '../shared/tmdbClient';
import { fetchByProvider, getMostPopular, getTopRated, searchByTitle, PROVIDERS } from '../shared/tmdbDiscoverService';

// --- Fetch de detalles (específico de series por el endpoint) ---

export const fetchSerieDetails = async (id: string | number) => {
    try {
        const { tmdbFetch } = await import('../shared/tmdbClient');
        return await tmdbFetch<any>(`/tv/${id}`);
    } catch (error) {
        console.error(`❌ Error al obtener detalles de serie ID ${id}:`, error);
        return null;
    }
};

// --- Funciones únicas de series ---

export const getLatestSeries = async ({ page }: { page?: string }): Promise<Serie[]> => {
    const pageNumber = page || "1";

    try {
        const series = await tmdbFetchList<Serie>('/tv/on_the_air', { page: pageNumber });

        const today = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(today.getDate() + 7);

        const filteredSeries = series.filter((serie) => {
            const firstAirDate = serie.first_air_date ? new Date(serie.first_air_date) : null;
            const nextEpisodeDate = serie.next_episode_to_air?.air_date ? new Date(serie.next_episode_to_air.air_date) : null;

            if (firstAirDate && firstAirDate > oneWeekLater) return false;
            if (nextEpisodeDate && nextEpisodeDate > oneWeekLater) return false;
            return true;
        });

        return filteredSeries.sort((a, b) => {
            if (b.vote_average !== a.vote_average) return b.vote_average - a.vote_average;
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            const dateA = new Date(a.first_air_date || "");
            const dateB = new Date(b.first_air_date || "");
            return dateB.getTime() - dateA.getTime();
        });
    } catch (error) {
        console.error("Error al obtener las series:", error);
        return [];
    }
};

// --- Categorías (lógica única: "on_the_air" y "horror") ---

import { SERIE_GENRE_SLUGS as genreMap } from '../../../utils/constants/genreSlugs';

export const getSeriesByCategory = async (category: string, page: string = "1"): Promise<Serie[]> => {
    const normalizedCategory = category.trim().toLowerCase();
    const genreOrType = genreMap[normalizedCategory];

    if (!genreOrType) {
        throw new Error(`Categoría no válida: ${category}`);
    }

    try {
        let series: Serie[];

        if (genreOrType === "on_the_air") {
            series = await tmdbFetchList<Serie>('/tv/on_the_air', { page });
        } else if (genreOrType === "horror") {
            series = await tmdbFetchList<Serie>('/search/tv', { query: 'horror', page });
        } else {
            series = await tmdbFetchList<Serie>('/discover/tv', {
                with_genres: genreOrType.toString(),
                sort_by: 'popularity.desc',
                'vote_count.gte': '100',
                page,
            });
        }

        return series.sort((a, b) => {
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            return b.vote_average - a.vote_average;
        });
    } catch (error) {
        console.error("Error al obtener las series:", error);
        return [];
    }
};

// --- Funciones delegadas a módulos compartidos ---

export const getMostPopularSeries = async ({ page }: { page?: string }): Promise<Serie[]> =>
    getMostPopular<Serie>('tv', page);

export const getTopRatedSeries = async ({ page }: { page?: string }): Promise<Serie[]> =>
    getTopRated<Serie>('tv', page);

export const getSeriesByTitle = async ({ title, page }: { title: string; page?: string }): Promise<Serie[]> =>
    searchByTitle<Serie>('tv', title, page);

export const getNetflixSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.NETFLIX, page);
export const getAmazonPrimeSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.AMAZON, page);
export const getDisneyPlusSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.DISNEY, page);
export const getHBOMaxSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.HBO, page);
export const getAppleTVSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.APPLE, page);
export const getMovistarPlusSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.MOVISTAR, page);
export const getFilminSeries = async (page?: string) => fetchByProvider<Serie>('tv', PROVIDERS.FILMIN, page);
