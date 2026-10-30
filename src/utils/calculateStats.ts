import {getGenreName} from "./constants/genres";
import {toTimestamp} from "./constants/helpers/media-helpers";

interface StatsInput {
    seriesData: any[];
    moviesData: any[];
    seriesDetails: any[];
    moviesDetails: any[];
}

export function calculateStats({seriesData, moviesData, seriesDetails, moviesDetails}: StatsInput) {
    const currentYear = new Date().getFullYear();

    // Últimas series añadidas
    const sortedSeries = [...seriesData].sort((a, b) => toTimestamp(b.added_at) - toTimestamp(a.added_at));
    const latestSeries = sortedSeries.slice(0, 5).map(s => {
        const details = seriesDetails.find(sf => sf.id.toString() === s.id);
        return {
            id: s.id,
            name: details?.name || 'Cargando...',
            poster_path: details?.poster_path,
            added_at: s.added_at
        };
    });

    // Últimas películas añadidas
    const sortedMovies = [...moviesData].sort((a, b) => toTimestamp(b.added_at) - toTimestamp(a.added_at));
    const latestMovies = sortedMovies.slice(0, 5).map(m => {
        const details = moviesDetails.find(mf => mf.id.toString() === m.id);
        return {
            id: m.id,
            title: details?.title || 'Cargando...',
            poster_path: details?.poster_path,
            added_at: m.added_at
        };
    });

    // Estadísticas de series
    const episodiosTotal = seriesDetails.reduce((acc, s) => acc + (s.number_of_episodes || 0), 0);
    const seriesStats = {
        total: seriesDetails.length,
        enEmision: seriesDetails.filter(s => s.status === 'Returning Series').length,
        finalizadas: seriesDetails.filter(s => s.status === 'Ended').length,
        temporadasTotal: seriesDetails.reduce((acc, s) => acc + (s.number_of_seasons || 0), 0),
        episodiosTotal,
        añoMasAntiguo: Math.min(...seriesDetails.map(s => new Date(s.first_air_date || currentYear).getFullYear()).filter(year => !isNaN(year))),
        añoMasReciente: Math.max(...seriesDetails.map(s => new Date(s.first_air_date || 0).getFullYear()).filter(year => !isNaN(year))),
        notaPromedio: Number((seriesDetails.reduce((acc, s) => acc + (s.vote_average || 0), 0) / Math.max(seriesDetails.length, 1)).toFixed(1)),
        latestAdded: latestSeries
    };

    // Estadísticas de películas
    const totalMovieRuntime = moviesDetails.reduce((acc, p) => acc + (p.runtime || 0), 0);
    const moviesStats = {
        total: moviesDetails.length,
        añoMasAntiguo: Math.min(...moviesDetails.map(p => new Date(p.release_date || currentYear).getFullYear()).filter(year => !isNaN(year))),
        añoMasReciente: Math.max(...moviesDetails.map(p => new Date(p.release_date || 0).getFullYear()).filter(year => !isNaN(year))),
        notaPromedio: Number((moviesDetails.reduce((acc, p) => acc + (p.vote_average || 0), 0) / Math.max(moviesDetails.length, 1)).toFixed(1)),
        duracionPromedio: Math.round(totalMovieRuntime / Math.max(moviesDetails.length, 1)),
        duracionTotal: totalMovieRuntime,
        latestAdded: latestMovies
    };

    // Tiempo total estimado viendo (en minutos)
    // Series: episodios × runtime promedio por episodio (estimado 45 min si no hay dato)
    const seriesWatchtime = seriesDetails.reduce((acc, s) => {
        const episodes = s.number_of_episodes || 0;
        const avgRuntime = s.episode_run_time?.[0] || 45;
        return acc + (episodes * avgRuntime);
    }, 0);
    const totalWatchtime = totalMovieRuntime + seriesWatchtime;
    const watchtimeDays = Math.floor(totalWatchtime / 1440);
    const watchtimeHours = Math.floor((totalWatchtime % 1440) / 60);

    // Géneros más populares
    const genreCount = new Map<string, number>();
    [...seriesDetails, ...moviesDetails].forEach(item => {
        const genres = item.genres || item.genre_ids?.map((id: number) => ({id, name: getGenreName(id)})) || [];
        genres.forEach((genre: {name: string} | number) => {
            const genreName = typeof genre === 'object' ? genre.name : getGenreName(genre);
            if (genreName) genreCount.set(genreName, (genreCount.get(genreName) || 0) + 1);
        });
    });

    const topGenres = Array.from(genreCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({name, count}));

    // Décadas más populares
    const decadeCount = new Map<string, number>();
    [...seriesDetails, ...moviesDetails].forEach(item => {
        const date = item.release_date || item.first_air_date;
        if (date) {
            const year = new Date(date).getFullYear();
            const decade = Math.floor(year / 10) * 10;
            decadeCount.set(`${decade}s`, (decadeCount.get(`${decade}s`) || 0) + 1);
        }
    });

    const topDecades = Array.from(decadeCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    // Países de origen
    const countryCount = new Map<string, number>();
    [...seriesDetails, ...moviesDetails].forEach(item => {
        const countries = item.origin_country || (item.original_language ? [item.original_language.toUpperCase()] : []);
        countries.forEach((c: string) => {
            countryCount.set(c, (countryCount.get(c) || 0) + 1);
        });
    });
    const topCountries = Array.from(countryCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => ({code, count}));

    // Opiniones (campo `opinion` de las filas de la biblioteca)
    const allData = [...seriesData, ...moviesData];
    const withOpinion = allData.filter(d => d.opinion && d.opinion.trim().length > 0);
    const opinionStats = {
        total: withOpinion.length,
        percentage: allData.length > 0 ? Math.round((withOpinion.length / allData.length) * 100) : 0,
    };

    // Ratings personales (1-10). Dedup por id+tipo para no contar el mismo item varias veces
    // (los ratings se replican en todas las colecciones, como las opiniones)
    interface RatingPair {
        id: string;
        title: string;
        personal: number;
        tmdb: number;
        poster_path: string | null;
        type: 'serie' | 'movie';
    }
    const ratingMap = new Map<string, RatingPair>();
    seriesData.forEach(d => {
        if (typeof d.rating === 'number' && !ratingMap.has(`s-${d.id}`)) {
            const det = seriesDetails.find(s => s.id.toString() === d.id);
            if (det) ratingMap.set(`s-${d.id}`, {
                id: d.id, title: det.name, personal: d.rating, tmdb: Number(det.vote_average) || 0,
                poster_path: det.poster_path || null, type: 'serie'
            });
        }
    });
    moviesData.forEach(d => {
        if (typeof d.rating === 'number' && !ratingMap.has(`m-${d.id}`)) {
            const det = moviesDetails.find(m => m.id.toString() === d.id);
            if (det) ratingMap.set(`m-${d.id}`, {
                id: d.id, title: det.title, personal: d.rating, tmdb: Number(det.vote_average) || 0,
                poster_path: det.poster_path || null, type: 'movie'
            });
        }
    });
    const ratingPairs = Array.from(ratingMap.values());
    const uniqueSeriesCount = new Set(seriesData.map(d => d.id)).size;
    const uniqueMoviesCount = new Set(moviesData.map(d => d.id)).size;
    const uniqueItemCount = uniqueSeriesCount + uniqueMoviesCount;

    function summarize(pairs: RatingPair[], totalItems: number) {
        if (pairs.length === 0) {
            return { total: 0, percentage: 0, avgPersonal: 0, avgDiffVsTmdb: 0, best: null, worst: null };
        }
        const sorted = [...pairs].sort((a, b) => b.personal - a.personal);
        return {
            total: pairs.length,
            percentage: totalItems > 0 ? Math.round((pairs.length / totalItems) * 100) : 0,
            avgPersonal: Number((pairs.reduce((a, p) => a + p.personal, 0) / pairs.length).toFixed(1)),
            avgDiffVsTmdb: Number((pairs.reduce((a, p) => a + (p.personal - p.tmdb), 0) / pairs.length).toFixed(1)),
            best: sorted[0] || null,
            worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
        };
    }

    const seriesPairs = ratingPairs.filter(p => p.type === 'serie');
    const moviesPairs = ratingPairs.filter(p => p.type === 'movie');
    const ratingStats = {
        ...summarize(ratingPairs, uniqueItemCount),
        series: summarize(seriesPairs, uniqueSeriesCount),
        movies: summarize(moviesPairs, uniqueMoviesCount),
    };

    return {
        series: seriesStats,
        movies: moviesStats,
        general: {
            totalContent: seriesDetails.length + moviesDetails.length,
            topGenres,
            topDecades,
            topCountries,
            opinionStats,
            ratingStats,
            watchtime: { total: totalWatchtime, days: watchtimeDays, hours: watchtimeHours },
            notaPromedioGeneral: (((seriesStats.notaPromedio * seriesDetails.length) + (moviesStats.notaPromedio * moviesDetails.length)) / Math.max(seriesDetails.length + moviesDetails.length, 1)).toFixed(1)
        }
    };
}
