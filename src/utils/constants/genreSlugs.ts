// Mapas de slug (URL) → ID de género de TMDB
// Movies y Series usan IDs de género diferentes en TMDB

export const MOVIE_GENRE_SLUGS: Record<string, number | "upcoming"> = {
    accion: 28, aventura: 12, animacion: 16, comedia: 35, crimen: 80,
    documental: 99, drama: 18, familia: 10751, fantasia: 14, historico: 36,
    terror: 27, musical: 10402, misterio: 9648, romance: 10749,
    ciencia_ficcion: 878, pelicula_tv: 10770, suspense: 53, belica: 10752,
    western: 37, proximamente: "upcoming",
};

export const SERIE_GENRE_SLUGS: Record<string, number | "on_the_air" | "horror"> = {
    accion: 10759, aventura: 10759, animacion: 16, comedia: 35, crimen: 80,
    documental: 99, drama: 18, familia: 10751, infantil: 10762, misterio: 9648,
    noticias: 10763, reality: 10764, ciencia_ficcion: 10765, fantasia: 10765,
    romance: 10749, telenovela: 10766, talkshow: 10767,
    terror: "horror", guerra_politica: 10768, western: 37,
    proximamente: "on_the_air",
};
