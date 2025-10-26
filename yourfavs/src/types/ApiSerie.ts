export type APISerie = {
    docs: Serie [];
    totalDocs: number;
    offset: number;
    limit: number;
    totalPages: number;
    page: number;
    pagingCounter: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
    prevPage: number | null; // Ahora permite número o null
    nextPage: number | null; // Para mayor coherencia, también permite null
};

export type Serie = {
    adult: boolean;
    backdrop_path: string;
    genres: { id: number, name: string }[];
    genre_ids: number[];
    id: number;
    origin_country: string[];
    original_language: string;
    original_name: string;
    overview: string;
    popularity: number;
    poster_path: string;
    first_air_date: string;
    name: string;
    vote_average: number;
    vote_count: number;
    languages?: string[];
    seasons?: {
        air_date: string,
        episode_count: number,
        id: number,
        name: string,
        overview: string,
        poster_path: string,
        season_number: number
    }[];
    production_companies?: { id: number, name: string, logo_path: string }[];
    homepage?: string;
    last_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };
    next_episode_to_air?: {
        air_date: string,
        episode_number: number,
        id: number,
        name: string,
        overview: string,
        production_code: string,
        season_number: number,
        still_path: string,
        vote_average: number,
        vote_count: number
    };

    // Nuevo campo para las plataformas de visualización
    providers?: {
        provider_id: number;
        provider_name: string;
        logo_path: string;
        type?: 'flatrate' | 'rent' | 'buy';
    }[];
    character?: string;  // Añadido 'character' para series de tipo "cast"ç
    imdb_id?: string;
    availableInSpain?: boolean; // Indica si la serie está disponible en España
};
