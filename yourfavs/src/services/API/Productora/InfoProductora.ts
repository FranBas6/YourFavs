import { type Movie } from "../../../types/ApiMovie.ts";
import { tmdbFetch, posterUrl, backdropUrl } from '../shared/tmdbClient';

export async function getMoviesAndSeriesByCompanyName(
    companyName: string,
    sortBy: string = "quality",
    excludeId?: number,
    knownCompanyId?: number
): Promise<{
    success: boolean;
    companyInfo?: any;
    movies: Movie[];
    series: any[];
    error?: string;
}> {
    try {
        // 1. Usar ID directo si lo tenemos, si no buscar por nombre
        let companyId = knownCompanyId;

        if (!companyId) {
            const searchData = await tmdbFetch<{ results: any[] }>('/search/company', {
                query: encodeURIComponent(companyName),
            });

            if (!searchData.results.length) {
                return { success: false, movies: [], series: [], error: `No se encontró la productora "${companyName}"` };
            }

            companyId = searchData.results[0].id;
        }

        // 2. Info de la productora + películas + series en paralelo
        const resolvedId = companyId as number;
        const [companyInfo, moviesData, seriesData] = await Promise.all([
            tmdbFetch<any>(`/company/${resolvedId}`).catch(() => null),
            fetchAllPages(resolvedId, 'movie', 10),
            fetchAllPages(resolvedId, 'tv', 10),
        ]);

        const calculateScore = (item: any, type: "movie" | "tv"): number => {
            if (sortBy === "popularity") return item.popularity || 0;
            if (sortBy === "date") {
                const date = item[type === "movie" ? "release_date" : "first_air_date"];
                return date ? new Date(date).getTime() : 0;
            }
            return item.vote_average || 0;
        };

        const filterAndSort = (items: any[], type: "movie" | "tv") =>
            items
                .filter((item: any) => item.poster_path && item.vote_average > 0 && item.vote_count > 1 && (!excludeId || item.id !== excludeId))
                .sort((a: any, b: any) => calculateScore(b, type) - calculateScore(a, type));

        const movies: Movie[] = filterAndSort(moviesData, "movie").map((movie: any) => ({
            adult: movie.adult,
            backdrop_path: backdropUrl(movie.backdrop_path),
            genre_ids: movie.genre_ids,
            id: movie.id,
            original_language: movie.original_language,
            overview: movie.overview,
            popularity: movie.popularity,
            poster_path: posterUrl(movie.poster_path),
            title: movie.title,
            vote_average: movie.vote_average,
            vote_count: movie.vote_count,
            original_title: movie.original_title,
            release_date: movie.release_date,
            video: movie.video,
        }));

        const series = filterAndSort(seriesData, "tv").map((serie: any) => ({
            adult: serie.adult,
            backdrop_path: backdropUrl(serie.backdrop_path),
            genre_ids: serie.genre_ids,
            id: serie.id,
            original_language: serie.original_language,
            overview: serie.overview,
            popularity: serie.popularity,
            poster_path: posterUrl(serie.poster_path),
            name: serie.name,
            original_name: serie.original_name,
            first_air_date: serie.first_air_date,
            vote_average: serie.vote_average,
            vote_count: serie.vote_count,
            origin_country: serie.origin_country,
        }));

        return { success: true, companyInfo, movies, series };
    } catch (error) {
        console.error("Error al obtener información de la productora:", error);
        return { success: false, movies: [], series: [], error: error instanceof Error ? error.message : "Error desconocido" };
    }
}

async function fetchAllPages(companyId: number, mediaType: string, totalPages: number = 5): Promise<any[]> {
    let results: any[] = [];
    for (let page = 1; page <= totalPages; page++) {
        try {
            const data = await tmdbFetch<{ results: any[]; total_pages: number }>(`/discover/${mediaType}`, {
                with_companies: companyId.toString(),
                page: page.toString(),
            });
            results = results.concat(data.results || []);
            if (page >= data.total_pages) break;
        } catch { break; }
    }
    return results;
}
