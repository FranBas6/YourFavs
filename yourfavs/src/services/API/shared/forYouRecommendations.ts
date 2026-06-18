import { getPersonalRecommendations } from '../../../utils/personalRecommendations';

export interface ForYouItem {
    kind: 'movie' | 'tv';
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    date?: string;
    /** 4.4 · semilla que generó la reco ("porque viste X"); undefined si vino de géneros/tendencias. */
    seedTitle?: string;
}

export async function getForYouRecommendations(limit: number = 12): Promise<ForYouItem[]> {
    const recs = await getPersonalRecommendations();

    const movies: ForYouItem[] = recs.movies.map((m: any): ForYouItem => ({
        kind: 'movie',
        id: m.id,
        title: m.title,
        poster_path: m.poster_path,
        vote_average: m.vote_average,
        overview: m.overview,
        date: m.release_date,
        seedTitle: m._recSeedTitle,
    }));

    const series: ForYouItem[] = recs.tv.map((s: any): ForYouItem => ({
        kind: 'tv',
        id: s.id,
        title: s.name,
        poster_path: s.poster_path,
        vote_average: s.vote_average,
        overview: s.overview,
        date: s.first_air_date,
        seedTitle: s._recSeedTitle,
    }));

    // Interleave movies/series para variedad visual en home
    const out: ForYouItem[] = [];
    const max = Math.max(movies.length, series.length);
    for (let i = 0; i < max && out.length < limit; i++) {
        if (i < movies.length && out.length < limit) out.push(movies[i]);
        if (i < series.length && out.length < limit) out.push(series[i]);
    }
    return out;
}
