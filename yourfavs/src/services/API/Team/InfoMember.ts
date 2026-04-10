import { type Movie } from "../../../types/ApiMovie.ts";
import { tmdbFetch, posterUrl, backdropUrl } from '../shared/tmdbClient';

export async function getMoviesAndSeriesByMemberName(
    memberName: string,
    sortBy: string = 'quality',
    excludeId?: number
): Promise<{
    success: boolean;
    memberInfo?: any;
    movies: Movie[];
    series: any[];
    error?: string;
}> {
    try {
        // 1. Buscar el ID del miembro
        const searchData = await tmdbFetch<{ results: any[] }>('/search/person', {
            query: encodeURIComponent(memberName),
        });

        if (!searchData.results.length) {
            return { success: false, movies: [], series: [], error: `No se encontró la persona "${memberName}"` };
        }

        const memberId = searchData.results[0].id;

        // 2. Info + créditos en paralelo
        const [memberInfo, movieCreditsData, tvCreditsData] = await Promise.all([
            tmdbFetch<any>(`/person/${memberId}`).catch(() => null),
            tmdbFetch<{ crew: any[] }>(`/person/${memberId}/movie_credits`),
            tmdbFetch<{ crew: any[] }>(`/person/${memberId}/tv_credits`).catch(() => ({ crew: [] })),
        ]);

        const calculateScore = (item: any, type: 'movie' | 'tv'): number => {
            if (sortBy === 'popularity') return item.popularity || 0;
            if (sortBy === 'date') {
                const date = item[type === 'movie' ? 'release_date' : 'first_air_date'];
                return date ? new Date(date).getTime() : 0;
            }
            return item.vote_average || 0;
        };

        const filterSortDedupe = (items: any[], type: 'movie' | 'tv') => {
            const seen = new Set<number>();
            return items
                .filter((item: any) => {
                    if (!item.poster_path || item.vote_average <= 0 || item.vote_count <= 5) return false;
                    if (excludeId && item.id === excludeId) return false;
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                })
                .sort((a: any, b: any) => calculateScore(b, type) - calculateScore(a, type));
        };

        const movies: Movie[] = filterSortDedupe(movieCreditsData.crew || [], 'movie').map((movie: any) => ({
            adult: movie.adult,
            backdrop_path: backdropUrl(movie.backdrop_path),
            genre_ids: movie.genre_ids,
            id: movie.id.toString(),
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

        const series = filterSortDedupe(tvCreditsData.crew || [], 'tv').map((serie: any) => ({
            adult: serie.adult,
            backdrop_path: backdropUrl(serie.backdrop_path),
            genre_ids: serie.genre_ids,
            id: serie.id.toString(),
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

        return { success: true, memberInfo, movies, series };
    } catch (error) {
        console.error("Error al obtener información del miembro:", error);
        return { success: false, movies: [], series: [], error: error instanceof Error ? error.message : "Error desconocido" };
    }
}
