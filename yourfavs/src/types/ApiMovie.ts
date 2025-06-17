export type APIMovie = {
    docs: Movie [];
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

export type Movie = {
    adult: boolean;
    backdrop_path: string;
    genre_ids: number[];  // Ahora 'genres' es un array de objetos
    id: string;
    original_language: string;
    overview: string;
    popularity: number;
    poster_path: string;
    title: string;
    vote_average: number;
    vote_count: number;
    original_title?: string;
    release_date?: string;
    video?: boolean;
    homepage?: string;  // Se añadió 'homepage' a los posibles campos
    production_companies?: { id: number, name: string, logo_path: string }[]; // Añadido 'production_companies'
    providers?: {  // Añadido 'providers' para las plataformas de visualización
        provider_id: number;
        provider_name: string;
        logo_path: string;
    }[];  // Array de plataformas de visualización
};


