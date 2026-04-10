import { type APIMovie, type Movie } from "../../../types/ApiMovie.ts";

const API_KEY = import.meta.env.TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir TMDB_API_KEY en tu .env");
}

export async function getMoviesAndSeriesByCompanyName(
    companyName: string,
    sortBy: string = "quality",
    excludeId?: number
): Promise<{
    success: boolean;
    companyInfo?: any;
    movies: Movie[];
    series: any[];
    error?: string;
}> {
    try {
        // 1. Buscar el ID de la productora
        const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/company?api_key=${API_KEY}&query=${encodeURIComponent(companyName)}`
        );
        if (!searchRes.ok) throw new Error(`Error ${searchRes.status}: ${searchRes.statusText}`);
        const searchData = await searchRes.json();

        if (!searchData.results.length) {
            return {
                success: false,
                movies: [],
                series: [],
                error: `No se encontró la productora "${companyName}"`,
            };
        }

        const company = searchData.results[0];
        const companyId = company.id;

        // 2. Obtener información detallada de la productora
        const detailsRes = await fetch(
            `https://api.themoviedb.org/3/company/${companyId}?api_key=${API_KEY}&language=es-ES`
        );
        const companyInfo = detailsRes.ok ? await detailsRes.json() : null;

        // 3. Obtener películas (todas las páginas que quieras)
        const moviesData = await fetchAllPages(
            `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&with_companies=${companyId}`,
            10 // 🔹 hasta 5 páginas (100 resultados)
        );

        // 4. Obtener series
        const seriesData = await fetchAllPages(
            `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&with_companies=${companyId}`,
            10
        );

        // 5. Función de score
        const calculateScore = (item: any, type: "movie" | "tv"): number => {
            switch (sortBy) {
                case "popularity":
                    return item.popularity || 0;
                case "date":
                    const dateField = type === "movie" ? "release_date" : "first_air_date";
                    const date = item[dateField];
                    return date ? new Date(date).getTime() : 0;
                case "quality":
                default:
                    return item.vote_average || 0; // ✅ solo nota media
            }
        };

        // 6. Procesar películas
        const movies = (moviesData || [])
            .filter(
                (movie: any) =>
                    movie.poster_path &&
                    movie.vote_average > 0 &&
                    movie.vote_count > 5 &&
                    (!excludeId || movie.id !== excludeId)
            )
            .map((movie: any) => ({
                ...movie,
                score: calculateScore(movie, "movie"),
            }))
            .sort((a: any, b: any) => b.score - a.score)
            .map(
                (movie: any): Movie => ({
                    adult: movie.adult,
                    backdrop_path: movie.backdrop_path
                        ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}`
                        : "",
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
                    video: movie.video,
                })
            );

        // 7. Procesar series
        const series = (seriesData || [])
            .filter(
                (serie: any) =>
                    serie.poster_path &&
                    serie.vote_average > 0 &&
                    serie.vote_count > 5 &&
                    (!excludeId || serie.id !== excludeId)
            )
            .map((serie: any) => ({
                ...serie,
                score: calculateScore(serie, "tv"),
            }))
            .sort((a: any, b: any) => b.score - a.score)
            .map((serie: any) => ({
                adult: serie.adult,
                backdrop_path: serie.backdrop_path
                    ? `https://image.tmdb.org/t/p/w500${serie.backdrop_path}`
                    : "",
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
                origin_country: serie.origin_country,
            }));

        return {
            success: true,
            companyInfo,
            movies,
            series,
        };
    } catch (error) {
        console.error("Error al obtener información de la productora:", error);
        return {
            success: false,
            movies: [],
            series: [],
            error: error instanceof Error ? error.message : "Error desconocido",
        };
    }
}

// ✅ Función auxiliar para traer varias páginas
async function fetchAllPages(url: string, totalPages: number = 5) {
    let results: any[] = [];
    for (let page = 1; page <= totalPages; page++) {
        const res = await fetch(`${url}&page=${page}`);
        if (!res.ok) break;
        const data = await res.json();
        results = results.concat(data.results || []);
        if (page >= data.total_pages) break; // parar si ya no hay más páginas
    }
    return results;
}
