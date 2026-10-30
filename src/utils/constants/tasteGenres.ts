/**
 * Géneros curados del onboarding (Fase F.7) — bi-mapa cine ↔ TV.
 *
 * El usuario elige géneros UNA vez (por nombre). Pero TMDB usa IDs distintos
 * para películas y series (p. ej. "Acción" en cine es 28, y en TV cae bajo
 * "Action & Adventure" 10759). Guardamos el ID de cine Y el de TV de cada
 * género elegido → la afinidad de recomendaciones es correcta por tipo, sin
 * pedirle al usuario que elija géneros dos veces.
 *
 * Los géneros de cine sin equivalente razonable en TV (Terror, Romance,
 * Thriller, Historia, Música) llevan `tv: null` → no contaminan la señal de
 * series (justo lo que evita el ruido del modelo anterior, que metía IDs de
 * cine en la afinidad de TV).
 *
 * Fuente única de verdad: la usa el wizard (`/gustos`) para pintar los chips y
 * el endpoint de guardado (`/api/taste/save`) para partir la selección.
 */
export interface TasteGenre {
    name: string;
    movie: number;      // ID de género de cine (TMDB) — identifica el chip
    tv: number | null;  // ID de género de TV equivalente, o null si no aplica
}

export const TASTE_GENRES: TasteGenre[] = [
    { name: 'Drama',            movie: 18,    tv: 18 },
    { name: 'Ciencia ficción',  movie: 878,   tv: 10765 },  // Sci-Fi & Fantasy
    { name: 'Comedia',          movie: 35,    tv: 35 },
    { name: 'Thriller',         movie: 53,    tv: null },
    { name: 'Acción',           movie: 28,    tv: 10759 },   // Action & Adventure
    { name: 'Terror',           movie: 27,    tv: null },
    { name: 'Romance',          movie: 10749, tv: null },
    { name: 'Animación',        movie: 16,    tv: 16 },
    { name: 'Crimen',           movie: 80,    tv: 80 },
    { name: 'Fantasía',         movie: 14,    tv: 10765 },   // Sci-Fi & Fantasy
    { name: 'Documental',       movie: 99,    tv: 99 },
    { name: 'Misterio',         movie: 9648,  tv: 9648 },
    { name: 'Aventura',         movie: 12,    tv: 10759 },   // Action & Adventure
    { name: 'Bélica',           movie: 10752, tv: 10768 },   // War & Politics
    { name: 'Familia',          movie: 10751, tv: 10751 },
    { name: 'Música',           movie: 10402, tv: null },
    { name: 'Historia',         movie: 36,    tv: null },
    { name: 'Western',          movie: 37,    tv: 37 },
];

const BY_MOVIE_ID = new Map(TASTE_GENRES.map((g) => [g.movie, g]));

/**
 * Parte una selección de géneros (por su ID de cine, que es como los identifica
 * el wizard) en las dos listas que consume el motor. Dedup con Set (varios
 * géneros de cine pueden mapear al mismo de TV, p. ej. Acción y Aventura → 10759).
 */
export function splitGenreIds(selectedMovieIds: number[]): { movieGenres: number[]; tvGenres: number[] } {
    const movieGenres: number[] = [];
    const tvSet = new Set<number>();
    for (const id of selectedMovieIds) {
        const g = BY_MOVIE_ID.get(Number(id));
        if (!g) continue;
        movieGenres.push(g.movie);
        if (g.tv != null) tvSet.add(g.tv);
    }
    return { movieGenres: Array.from(new Set(movieGenres)), tvGenres: Array.from(tvSet) };
}
