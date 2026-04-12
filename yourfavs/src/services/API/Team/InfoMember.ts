import { type Movie } from "../../../types/ApiMovie.ts";
import { tmdbFetch, posterUrl, backdropUrl } from '../shared/tmdbClient';

export async function getMoviesAndSeriesByMemberName(
    memberName: string,
    sortBy: string = 'quality',
    excludeId?: number
): Promise<{
    success: boolean;
    memberInfo?: any;
    socialLinks?: any;
    movies: (Movie & { role?: string })[];
    series: (any & { role?: string })[];
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

        // 2. Info + créditos combinados + redes en paralelo
        const [memberInfo, creditsData, socialLinks] = await Promise.all([
            tmdbFetch<any>(`/person/${memberId}`).catch(() => null),
            tmdbFetch<{ cast: any[]; crew: any[] }>(`/person/${memberId}/combined_credits`),
            tmdbFetch<any>(`/person/${memberId}/external_ids`).catch(() => null),
        ]);

        const calculateScore = (item: any, type: 'movie' | 'tv'): number => {
            if (sortBy === 'popularity') return item.popularity || 0;
            if (sortBy === 'date') {
                const date = item[type === 'movie' ? 'release_date' : 'first_air_date'];
                return date ? new Date(date).getTime() : 0;
            }
            return item.vote_average || 0;
        };

        // Solo crew (equipo técnico) — los actores tienen su propia vista en /actor/
        const dedupeCrewCredits = (crew: any[]) => {
            const map = new Map<string, any>();
            for (const item of crew) {
                const key = `${item.media_type}-${item.id}`;
                if (!map.has(key)) {
                    map.set(key, { ...item, role: item.job || '' });
                }
            }
            return Array.from(map.values());
        };

        const allCredits = dedupeCrewCredits(creditsData.crew || []);

        const filterSortDedupe = (items: any[], type: 'movie' | 'tv') => {
            return items
                .filter((item: any) => {
                    if (item.media_type !== type) return false;
                    if (!item.poster_path || item.vote_average <= 0 || item.vote_count <= 5) return false;
                    if (excludeId && item.id === excludeId) return false;
                    return true;
                })
                .sort((a: any, b: any) => calculateScore(b, type) - calculateScore(a, type));
        };

        const movies = filterSortDedupe(allCredits, 'movie').map((movie: any) => ({
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
            role: movie.role || '',
        }));

        const series = filterSortDedupe(allCredits, 'tv').map((serie: any) => ({
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
            role: serie.role || '',
        }));

        // Formatear redes sociales
        const formattedSocial = socialLinks ? {
            imdb: socialLinks.imdb_id ? `https://www.imdb.com/name/${socialLinks.imdb_id}` : null,
            twitter: socialLinks.twitter_id ? `https://twitter.com/${socialLinks.twitter_id}` : null,
            instagram: socialLinks.instagram_id ? `https://instagram.com/${socialLinks.instagram_id}` : null,
            facebook: socialLinks.facebook_id ? `https://facebook.com/${socialLinks.facebook_id}` : null,
            tiktok: socialLinks.tiktok_id ? `https://www.tiktok.com/@${socialLinks.tiktok_id}` : null,
            youtube: socialLinks.youtube_id ? `https://www.youtube.com/${socialLinks.youtube_id}` : null,
        } : null;

        return { success: true, memberInfo, socialLinks: formattedSocial, movies, series };
    } catch (error) {
        console.error("Error al obtener información del miembro:", error);
        return { success: false, movies: [], series: [], error: error instanceof Error ? error.message : "Error desconocido" };
    }
}
