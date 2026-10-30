import { clearAllSeriesVerPronto, deleteSerieVerProntoById } from "../series/yourfavsSerie";
import { clearAllMoviesVerPronto, deleteMovieVerProntoById } from "../movies/yourfavsMovie";

export async function handleVerProntoAction(formData: FormData): Promise<string | null> {
    const clearAction = formData.get("clear");
    const deleteId = formData.get("deleteId");
    const deleteType = formData.get("deleteType");

    if (clearAction === "series") {
        await clearAllSeriesVerPronto();
        return "series";
    } else if (clearAction === "peliculas") {
        await clearAllMoviesVerPronto();
        return "peliculas";
    } else if (clearAction === "todos") {
        await clearAllSeriesVerPronto();
        await clearAllMoviesVerPronto();
        return "todos";
    } else if (deleteId && deleteType) {
        if (deleteType === "serie") {
            await deleteSerieVerProntoById(String(deleteId));
            return "serie";
        } else if (deleteType === "pelicula") {
            await deleteMovieVerProntoById(String(deleteId));
            return "pelicula";
        }
    }

    return null;
}
