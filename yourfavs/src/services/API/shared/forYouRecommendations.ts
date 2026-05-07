import { calculateGenrePreferences } from '../../../utils/genrePreferences';
import { tmdbFetchList } from './tmdbClient';

export interface ForYouItem {
    kind: 'movie' | 'tv';
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    date?: string;
}

export async function getForYouRecommendations(limit: number = 12): Promise<ForYouItem[]> {
    const prefs = await calculateGenrePreferences();
    if (prefs.movies.topGenres.length === 0 && prefs.tv.topGenres.length === 0) return [];

    const moviePromise = prefs.movies.topGenres.length
        ? tmdbFetchList<any>('/discover/movie', {
            with_genres: prefs.movies.topGenres.join(','),
            sort_by: 'popularity.desc',
            'vote_count.gte': '100',
            include_adult: 'false',
            page: '1',
        })
        : Promise.resolve([] as any[]);

    const tvPromise = prefs.tv.topGenres.length
        ? tmdbFetchList<any>('/discover/tv', {
            with_genres: prefs.tv.topGenres.join(','),
            sort_by: 'popularity.desc',
            'vote_count.gte': '50',
            include_adult: 'false',
            page: '1',
        })
        : Promise.resolve([] as any[]);

    const [moviesRaw, seriesRaw] = await Promise.all([moviePromise, tvPromise]);

    const movies: ForYouItem[] = moviesRaw
        .filter((m: any) => !prefs.libraryIds.movies.has(String(m.id)))
        .map((m: any): ForYouItem => ({
            kind: 'movie',
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
            overview: m.overview,
            date: m.release_date,
        }));

    const series: ForYouItem[] = seriesRaw
        .filter((s: any) => !prefs.libraryIds.tv.has(String(s.id)))
        .map((s: any): ForYouItem => ({
            kind: 'tv',
            id: s.id,
            title: s.name,
            poster_path: s.poster_path,
            vote_average: s.vote_average,
            overview: s.overview,
            date: s.first_air_date,
        }));

    const out: ForYouItem[] = [];
    const max = Math.max(movies.length, series.length);
    for (let i = 0; i < max && out.length < limit; i++) {
        if (i < movies.length && out.length < limit) out.push(movies[i]);
        if (i < series.length && out.length < limit) out.push(series[i]);
    }
    return out;
}
