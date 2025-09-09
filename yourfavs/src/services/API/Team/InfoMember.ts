import {type APIMovie, type Movie} from "../../../types/ApiMovie.ts";

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

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
        // 1. Buscar el ID del miembro del equipo por nombre
        const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(memberName)}`
        );
        if (!searchRes.ok) throw new Error(`Error ${searchRes.status}: ${searchRes.statusText}`);
        const searchData = await searchRes.json();

        if (!searchData.results.length) {
            return {
                success: false,
                movies: [],
                series: [],
                error: `No se encontró la persona "${memberName}"`
            };
        }

        const member = searchData.results[0];
        const memberId = member.id;

        // 2. Obtener información detallada del miembro
        const detailsRes = await fetch(
            `https://api.themoviedb.org/3/person/${memberId}?api_key=${API_KEY}&language=es-ES`
        );
        const memberInfo = detailsRes.ok ? await detailsRes.json() : null;

        // 3. Obtener créditos de películas
        const movieCreditsRes = await fetch(
            `https://api.themoviedb.org/3/person/${memberId}/movie_credits?api_key=${API_KEY}&language=es-ES`
        );
        if (!movieCreditsRes.ok) throw new Error(`Error ${movieCreditsRes.status}: ${movieCreditsRes.statusText}`);
        const movieCreditsData = await movieCreditsRes.json();

        // 4. Obtener créditos de series
        const tvCreditsRes = await fetch(
            `https://api.themoviedb.org/3/person/${memberId}/tv_credits?api_key=${API_KEY}&language=es-ES`
        );
        const tvCreditsData = tvCreditsRes.ok ? await tvCreditsRes.json() : { crew: [], cast: [] };

        // 5. Función para calcular scores según el tipo de ordenación
        const calculateScore = (item: any, type: 'movie' | 'tv'): number => {
            switch (sortBy) {
                case 'popularity':
                    return item.popularity || 0;
                
                case 'date':
                    const dateField = type === 'movie' ? 'release_date' : 'first_air_date';
                    const date = item[dateField];
                    return date ? new Date(date).getTime() : 0;
                
                case 'quality':
                default:
                    return item.vote_average || 0; // ✅ solo nota media
            }
        };

        // 6. Procesar películas
        const processMovies = () => {
            // SOLO CREW (equipo de producción)
            const allMovies = [
                ...(movieCreditsData.crew || [])
            ].filter((movie: any) =>
                movie.poster_path &&
                movie.vote_average > 0 &&
                movie.vote_count > 5 &&
                (!excludeId || movie.id !== excludeId)
            );

            // Eliminar duplicados
            const uniqueMovies = allMovies.reduce((acc: any[], current: any) => {
                const existing = acc.find(movie => movie.id === current.id);
                if (!existing) {
                    acc.push(current);
                }
                return acc;
            }, []);

            // Ordenar y limitar
            return uniqueMovies
                .map((movie: any) => ({
                    ...movie,
                    score: calculateScore(movie, 'movie')
                }))
                .sort((a: any, b: any) => b.score - a.score)
                .map((movie: any): Movie => ({
                    adult: movie.adult,
                    backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : "",
                    genre_ids: movie.genre_ids,
                    id: movie.id.toString(),
                    original_language: movie.original_language,
                    overview: movie.overview,
                    popularity: movie.popularity,
                    poster_path: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
                    title: movie.title,
                    vote_average: movie.vote_average,
                    vote_count: movie.vote_count,
                    original_title: movie.original_title,
                    release_date: movie.release_date,
                    video: movie.video
                }));
        };

        // 7. Procesar series
        const processSeries = () => {
            // SOLO CREW (equipo de producción)
            const allSeries = [
                ...(tvCreditsData.crew || [])
            ].filter((serie: any) =>
                serie.poster_path &&
                serie.vote_average > 0 &&
                serie.vote_count > 5 &&
                (!excludeId || serie.id !== excludeId)
            );

            // Eliminar duplicados
            const uniqueSeries = allSeries.reduce((acc: any[], current: any) => {
                const existing = acc.find(serie => serie.id === current.id);
                if (!existing) {
                    acc.push(current);
                }
                return acc;
            }, []);

            // Ordenar y limitar
            return uniqueSeries
                .map((serie: any) => ({
                    ...serie,
                    score: calculateScore(serie, 'tv')
                }))
                .sort((a: any, b: any) => b.score - a.score)
                .map((serie: any) => ({
                    adult: serie.adult,
                    backdrop_path: serie.backdrop_path ? `https://image.tmdb.org/t/p/w500${serie.backdrop_path}` : "",
                    genre_ids: serie.genre_ids,
                    id: serie.id.toString(),
                    original_language: serie.original_language,
                    overview: serie.overview,
                    popularity: serie.popularity,
                    poster_path: `https://image.tmdb.org/t/p/w500${serie.poster_path}`,
                    name: serie.name,
                    original_name: serie.original_name,
                    first_air_date: serie.first_air_date,
                    vote_average: serie.vote_average,
                    vote_count: serie.vote_count,
                    origin_country: serie.origin_country
                }));
        };

        const movies = processMovies();
        const series = processSeries();

        return {
            success: true,
            memberInfo,
            movies,
            series
        };

    } catch (error) {
        console.error("Error al obtener información del miembro:", error);
        return {
            success: false,
            movies: [],
            series: [],
            error: error instanceof Error ? error.message : "Error desconocido"
        };
    }
}