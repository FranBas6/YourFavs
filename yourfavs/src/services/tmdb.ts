const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;

if (!API_KEY) {
    throw new Error("🚨 No se encontró la clave de API de TMDB. Asegúrate de definir PUBLIC_TMDB_API_KEY en tu .env");
}

const BASE_URL = "https://api.themoviedb.org/3";

export const fetchMovieDetails = async (id: string | number) => {
    try {
        const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&language=es-ES`);

        if (!res.ok) {
            const errorBody = await res.text();
            console.error(`❌ Error al obtener película ID ${id}:`, res.status, errorBody);
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error(`❌ Error inesperado al obtener detalles de película ID ${id}:`, error);
        return null;
    }
};

export const fetchSerieDetails = async (id: string | number) => {
    try {
        const res = await fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}&language=es-ES`);

        if (!res.ok) {
            const errorBody = await res.text();
            console.error(`❌ Error al obtener serie ID ${id}:`, res.status, errorBody);
            return null;
        }

        return await res.json();
    } catch (error) {
        console.error(`❌ Error inesperado al obtener detalles de serie ID ${id}:`, error);
        return null;
    }
};

