// Tipos de las filas de series de la biblioteca (antes, documentos de Firestore).
// Antes vivían dentro de src/services/BD/series/yourfavsSerie.ts (R12).

interface TmdbSeasonRef {
    air_date: string;
    episode_count: number;
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    season_number: number;
}

interface TmdbEpisodeRef {
    air_date: string;
    episode_number: number;
    id: number;
    name: string;
    overview: string;
    production_code: string;
    season_number: number;
    still_path: string;
    vote_average: number;
    vote_count: number;
}

interface GenreRef {
    id: number;
    name: string;
}

export interface SeriesFavs {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    opinion?: string;
    added_at: Date | string;
    position: number;
    custom_order?: number;
    first_air_date?: string;
    seasons?: TmdbSeasonRef[];
    last_episode_to_air?: TmdbEpisodeRef;
    next_episode_to_air?: TmdbEpisodeRef;
    genres?: GenreRef[];
    status?: string;
}

export interface SeriesInterface {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    opinion?: string;
    added_at: Date | string;
    first_air_date?: string;
    seasons?: TmdbSeasonRef[];
    last_episode_to_air?: TmdbEpisodeRef;
    next_episode_to_air?: TmdbEpisodeRef;
    genres?: GenreRef[];
    status?: string;
}

export interface RecommendedSeries {
    id: string;
    name: string;
    poster_path: string;
    vote_average: number;
    overview: string;
    score?: number;
    added_at?: Date | string;
    first_air_date?: string;
    seasons?: TmdbSeasonRef[];
    last_episode_to_air?: TmdbEpisodeRef;
    next_episode_to_air?: TmdbEpisodeRef;
    genres?: GenreRef[];
    status?: string;
    sourceTitle?: string;
}

export interface WatchedEpisode {
    season: number;
    episode: number;
    watched_at: string;
}

export interface WatchedProgress {
    id: string;
    watched_episodes: WatchedEpisode[];
    last_watched: WatchedEpisode | null;
}
