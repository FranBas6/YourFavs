import { fetchMovieDetails } from "../services/API/Movies/tmdbMovies";
import { fetchSerieDetails } from "../services/API/Series/tmdbSeries";
import { getWatchedProgressBatch, getWatchStreak } from "../services/BD/series/yourfavsSerie";
import { tmdbFetch } from "../services/API/shared/tmdbClient";
import { mapAndDeduplicateProviders } from "../services/API/shared/tmdbInfoService";
import { getGenreName } from "./constants/genres";
import { processBatch } from "./processBatch";
import { calculateStats } from "./calculateStats";

const ITEMS_PER_PAGE = 20;

export interface PersonalPageConfig {
    getSeries: () => Promise<any[]>;
    getMovies: () => Promise<any[]>;
}

export interface PersonalPageData {
    // URL params
    filter: string;
    searchQuery: string;
    genreFilter: string;
    platformFilter: string;
    showSeries: boolean;
    showMovies: boolean;
    showAll: boolean;
    seriesPage: number;
    moviesPage: number;
    pageUrl: URL;
    itemsPerPage: number;
    // Raw Firestore data
    seriesData: any[];
    moviesData: any[];
    // TMDB details (all fetched, non-null)
    seriesItems: any[];
    moviesItems: any[];
    // Filtered + paginated
    filteredSeries: any[];
    filteredMovies: any[];
    seriesPaginadas: any[];
    peliculasPaginadas: any[];
    hasMoreSeries: boolean;
    hasMoreMovies: boolean;
    seriesItemsToShow: number;
    moviesItemsToShow: number;
    // Derived
    availableGenres: string[];
    activeGenres: string[];
    activePlatformIds: number[];
    stats: any;
    watchedMap: Record<string, { watched: number; total?: number }>;
    errorMessage: string;
}

/**
 * Encapsula el patrón compartido por favoritos/pendientes/megusta/vistos:
 * lee params de URL, fetch series+movies en paralelo con batching, filtros,
 * cálculo de stats incluyendo watched episodes. La página solo pasa la config
 * de colección y renderiza el template con los datos devueltos.
 */
export async function fetchPersonalPageData(
    config: PersonalPageConfig,
    url: URL
): Promise<PersonalPageData> {
    const filter = url.searchParams.get("filter") || "todos";
    const searchQuery = url.searchParams.get("search") || "";
    const genreFilter = url.searchParams.get("genre") || "";
    const platformFilter = url.searchParams.get("platforms") || "";
    const showSeries = filter === "series" || filter === "todos";
    const showMovies = filter === "peliculas" || filter === "todos";
    const showAll = filter === "todos";
    const seriesPage = parseInt(url.searchParams.get("seriesPage") || "1");
    const moviesPage = parseInt(url.searchParams.get("moviesPage") || "1");

    let seriesData: any[] = [];
    let moviesData: any[] = [];
    let seriesItems: any[] = [];
    let moviesItems: any[] = [];
    let errorMessage = "";

    try {
        [seriesData, moviesData] = await Promise.all([config.getSeries(), config.getMovies()]);
        const [seriesResults, moviesResults] = await Promise.all([
            processBatch(seriesData.map((s) => s.id), (id) => fetchSerieDetails(id), 10),
            processBatch(moviesData.map((p) => p.id), (id) => fetchMovieDetails(id), 10),
        ]);
        seriesItems = seriesResults.filter((s) => s !== null);
        moviesItems = moviesResults.filter((m) => m !== null);
    } catch (error) {
        console.error("Error al cargar contenido personal:", error);
        errorMessage = error instanceof Error ? error.message : "Error desconocido al cargar datos";
    }

    const [watchedMap, watchStreak] = await Promise.all([
        getWatchedProgressBatch(seriesItems.map((s: any) => String(s.id))),
        getWatchStreak(),
    ]);

    // Géneros disponibles
    const genreSet = new Set<string>();
    [...seriesItems, ...moviesItems].forEach((item: any) => {
        const genres = item.genres || item.genre_ids?.map((id: number) => ({ name: getGenreName(id) })) || [];
        genres.forEach((g: any) => { if (g.name) genreSet.add(g.name); });
    });
    const availableGenres = Array.from(genreSet).sort();

    // Filtro por búsqueda
    const searchLower = searchQuery.toLowerCase();
    let filteredSeries = seriesItems;
    let filteredMovies = moviesItems;
    if (searchQuery) {
        filteredSeries = filteredSeries.filter((s: any) => s.name?.toLowerCase().includes(searchLower));
        filteredMovies = filteredMovies.filter((m: any) => m.title?.toLowerCase().includes(searchLower));
    }

    // Filtro por género
    const activeGenres = genreFilter ? genreFilter.split(',').filter(Boolean) : [];
    if (activeGenres.length > 0) {
        const matchesGenre = (item: any) => {
            const genres = item.genres || item.genre_ids?.map((id: number) => ({ name: getGenreName(id) })) || [];
            return activeGenres.some((ag: string) => genres.some((g: any) => g.name === ag));
        };
        filteredSeries = filteredSeries.filter(matchesGenre);
        filteredMovies = filteredMovies.filter(matchesGenre);
    }

    // Filtro por plataforma (batch fetch solo si hay filtro)
    const activePlatformIds = platformFilter ? platformFilter.split(',').map(Number).filter(Boolean) : [];
    if (activePlatformIds.length > 0) {
        const [seriesProviders, movieProviders] = await Promise.all([
            processBatch(filteredSeries.map((s: any) => s.id), async (id: number) => {
                try {
                    const data = await tmdbFetch<{ results: any }>(`/tv/${id}/watch/providers`, {});
                    return { id, providers: mapAndDeduplicateProviders(data.results?.ES || {}) };
                } catch { return { id, providers: [] }; }
            }, 10),
            processBatch(filteredMovies.map((m: any) => m.id), async (id: number) => {
                try {
                    const data = await tmdbFetch<{ results: any }>(`/movie/${id}/watch/providers`, {});
                    return { id, providers: mapAndDeduplicateProviders(data.results?.ES || {}) };
                } catch { return { id, providers: [] }; }
            }, 10),
        ]);
        const seriesProvMap = new Map(seriesProviders.map((p: any) => [p.id, p.providers]));
        const movieProvMap = new Map(movieProviders.map((p: any) => [p.id, p.providers]));
        filteredSeries = filteredSeries.filter((s: any) => {
            const provs = seriesProvMap.get(s.id) || [];
            return provs.some((p: any) => activePlatformIds.includes(p.provider_id));
        });
        filteredMovies = filteredMovies.filter((m: any) => {
            const provs = movieProvMap.get(m.id) || [];
            return provs.some((p: any) => activePlatformIds.includes(p.provider_id));
        });
    }

    // Paginación
    const seriesItemsToShow = seriesPage * ITEMS_PER_PAGE;
    const moviesItemsToShow = moviesPage * ITEMS_PER_PAGE;
    const seriesPaginadas = filteredSeries.slice(0, seriesItemsToShow);
    const peliculasPaginadas = filteredMovies.slice(0, moviesItemsToShow);
    const hasMoreSeries = filteredSeries.length > seriesItemsToShow;
    const hasMoreMovies = filteredMovies.length > moviesItemsToShow;

    // Stats
    const stats = calculateStats({
        seriesData,
        moviesData,
        seriesDetails: seriesItems,
        moviesDetails: moviesItems,
    });

    // Watched stats
    const watchedEntries = Object.entries(watchedMap) as [string, { watched: number }][];
    const totalWatchedEpisodes = watchedEntries.reduce((sum, [, v]) => sum + v.watched, 0);
    const topWatchedEntry = watchedEntries.length > 0
        ? watchedEntries.sort((a, b) => b[1].watched - a[1].watched)[0]
        : null;
    const topSerieName = topWatchedEntry
        ? seriesItems.find((s: any) => String(s.id) === topWatchedEntry[0])?.name
        : null;
    (stats as any).watched = {
        totalEpisodes: totalWatchedEpisodes,
        topSerie: topSerieName && topWatchedEntry ? { name: topSerieName, watched: topWatchedEntry[1].watched } : null,
        streak: watchStreak.current,
    };

    return {
        filter, searchQuery, genreFilter, platformFilter,
        showSeries, showMovies, showAll,
        seriesPage, moviesPage,
        pageUrl: url,
        itemsPerPage: ITEMS_PER_PAGE,
        seriesData, moviesData,
        seriesItems, moviesItems,
        filteredSeries, filteredMovies,
        seriesPaginadas, peliculasPaginadas,
        hasMoreSeries, hasMoreMovies,
        seriesItemsToShow, moviesItemsToShow,
        availableGenres, activeGenres, activePlatformIds,
        stats, watchedMap, errorMessage,
    };
}
