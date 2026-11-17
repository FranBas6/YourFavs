export const genresMap: Record<number, string> = {
    28: "Acción",
    12: "Aventura",
    16: "Animación",
    35: "Comedia",
    80: "Crimen",
    99: "Documental",
    18: "Drama",
    10751: "Familia",
    14: "Fantasía",
    36: "Historia",
    27: "Terror",
    10402: "Música",
    9648: "Misterio",
    10749: "Romance",
    878: "Ciencia ficción",
    10770: "Película de TV",
    53: "Thriller",
    10752: "Bélica",
    37: "Western",
    10759: "Acción y Aventura",
    10762: "Infantil",
    10763: "Noticias",
    10764: "Reality",
    10765: "Sci-Fi y Fantasía",
    10766: "Soap",
    10767: "Talk",
    10768: "Guerra y Política"
};

export function getGenreName(id: number): string {
    return genresMap[id] || "Otro";
}
