/**
 * Servicio que proporciona funciones que la IA puede usar
 * para consultar TMDB y navegar en la app
 */

const API_KEY = import.meta.env.PUBLIC_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

export interface AIFunction {
    name: string;
    description: string;
    parameters: any;
    execute: (...args: any[]) => Promise<any>;
}

/**
 * Buscar información de una película en TMDB
 */
async function searchMovie(title: string) {
    try {
        const response = await fetch(
            `${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(title)}`
        );
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const movie = data.results[0];
            return {
                success: true,
                data: {
                    id: movie.id,
                    title: movie.title,
                    overview: movie.overview,
                    release_date: movie.release_date,
                    vote_average: movie.vote_average,
                    genres: movie.genre_ids,
                    // Formato especial para que la IA lo use en sus respuestas
                    formatted: `[MOVIE:${movie.id}:${movie.title}]`
                }
            };
        }
        return { success: false, error: "No se encontró la película" };
    } catch (error) {
        return { success: false, error: "Error al buscar la película" };
    }
}

/**
 * Buscar información de una serie en TMDB
 */
async function searchSeries(name: string) {
    try {
        const response = await fetch(
            `${BASE_URL}/search/tv?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(name)}`
        );
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const serie = data.results[0];
            return {
                success: true,
                data: {
                    id: serie.id,
                    name: serie.name,
                    overview: serie.overview,
                    first_air_date: serie.first_air_date,
                    vote_average: serie.vote_average,
                    // Formato especial para que la IA lo use en sus respuestas
                    formatted: `[SERIE:${serie.id}:${serie.name}]`
                }
            };
        }
        return { success: false, error: "No se encontró la serie" };
    } catch (error) {
        return { success: false, error: "Error al buscar la serie" };
    }
}

/**
 * Obtener detalles de una serie incluyendo siguiente episodio
 */
async function getSeriesDetails(seriesId: number) {
    try {
        const response = await fetch(
            `${BASE_URL}/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`
        );
        const data = await response.json();
        
        return {
            success: true,
            data: {
                name: data.name,
                number_of_seasons: data.number_of_seasons,
                number_of_episodes: data.number_of_episodes,
                status: data.status,
                next_episode_to_air: data.next_episode_to_air,
                last_episode_to_air: data.last_episode_to_air
            }
        };
    } catch (error) {
        return { success: false, error: "Error al obtener detalles de la serie" };
    }
}

/**
 * Obtener películas en cartelera
 */
async function getMoviesInTheaters() {
    try {
        const response = await fetch(
            `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=es-ES&region=ES`
        );
        const data = await response.json();
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: movies
        };
    } catch (error) {
        return { success: false, error: "Error al obtener películas en cartelera" };
    }
}

/**
 * Obtener próximos estrenos
 */
async function getUpcomingMovies() {
    try {
        const response = await fetch(
            `${BASE_URL}/movie/upcoming?api_key=${API_KEY}&language=es-ES&region=ES`
        );
        const data = await response.json();
        
        const movies = data.results.slice(0, 10).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            release_date: movie.release_date,
            overview: movie.overview,
            formatted: `[MOVIE:${movie.id}:${movie.title}]`
        }));
        
        return {
            success: true,
            data: movies
        };
    } catch (error) {
        return { success: false, error: "Error al obtener próximos estrenos" };
    }
}

/**
 * Obtener proveedores de streaming (plataformas)
 * Busca primero por nombre y luego obtiene las plataformas
 */
async function getStreamingProviders(title: string, type: 'movie' | 'tv' = 'tv') {
    try {
        // Primero buscar para obtener el ID
        const searchEndpoint = type === 'movie' ? 'search/movie' : 'search/tv';
        const searchResponse = await fetch(
            `${BASE_URL}/${searchEndpoint}?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(title)}`
        );
        const searchData = await searchResponse.json();
        
        if (!searchData.results || searchData.results.length === 0) {
            return {
                success: false,
                error: `No se encontró "${title}"`
            };
        }
        
        const item = searchData.results[0];
        const itemId = item.id;
        const itemTitle = type === 'movie' ? item.title : item.name;
        const formatted = type === 'movie' ? `[MOVIE:${itemId}:${itemTitle}]` : `[SERIE:${itemId}:${itemTitle}]`;
        
        // Obtener proveedores
        const providersResponse = await fetch(
            `${BASE_URL}/${type}/${itemId}/watch/providers?api_key=${API_KEY}`
        );
        const providersData = await providersResponse.json();
        
        const esProviders = providersData.results?.ES;
        
        if (!esProviders) {
            return {
                success: true,
                data: {
                    id: itemId,
                    title: itemTitle,
                    formatted: formatted,
                    platforms: 'No encontré información de streaming actualizada en TMDB para España',
                    hint: 'Te recomiendo buscar directamente en plataformas como Netflix, Prime Video, Disney+, HBO Max o Movistar+ para verificar su disponibilidad actual.'
                }
            };
        }
        
        const platforms: string[] = [];
        
        // Streaming (suscripción)
        if (esProviders.flatrate && esProviders.flatrate.length > 0) {
            platforms.push(...esProviders.flatrate.map((p: any) => p.provider_name));
        }
        
        // Alquiler
        const rentals = esProviders.rent ? esProviders.rent.map((p: any) => p.provider_name) : [];
        
        // Compra
        const buy = esProviders.buy ? esProviders.buy.map((p: any) => p.provider_name) : [];
        
        return {
            success: true,
            data: {
                id: itemId,
                title: itemTitle,
                formatted: formatted,
                platforms: platforms.length > 0 ? platforms.join(', ') : 'No disponible en streaming',
                rent: rentals.length > 0 ? rentals.join(', ') : null,
                buy: buy.length > 0 ? buy.join(', ') : null
            }
        };
    } catch (error) {
        return {
            success: false,
            error: "Error al obtener plataformas de streaming"
        };
    }
}

/**
 * Navegar a una página de la app
 */
async function navigateToPage(route: string): Promise<{ success: boolean; message: string }> {
    const routes: { [key: string]: string } = {
        "acción": "/catalogo/categorias?genre=28",
        "comedia": "/catalogo/categorias?genre=35",
        "drama": "/catalogo/categorias?genre=18",
        "terror": "/catalogo/categorias?genre=27",
        "ciencia ficción": "/catalogo/categorias?genre=878",
        "romance": "/catalogo/categorias?genre=10749",
        "populares": "/catalogo/maspopulares",
        "estrenos": "/catalogo/ultimoslanzamientos",
        "cartelera": "/catalogo/cartelera",
        "top películas": "/catalogo/topmovies",
        "top series": "/catalogo/topseries",
        "favoritos": "/personal/favoritos",
        "pendientes": "/personal/pendientes",
        "vistos": "/personal/vistos",
        "me gusta": "/personal/megusta"
    };

    const normalizedRoute = route.toLowerCase();
    const targetRoute = routes[normalizedRoute];

    if (targetRoute) {
        // En un componente React, usaremos window.location para navegar
        return {
            success: true,
            message: `NAVIGATE_TO:${targetRoute}`,
        };
    }

    return {
        success: false,
        message: "No se encontró la página solicitada"
    };
}

/**
 * Lista de funciones disponibles para la IA
 */
export const availableFunctions: AIFunction[] = [
    {
        name: "searchMovie",
        description: "Busca información actualizada de una película en TMDB",
        parameters: { title: "string" },
        execute: searchMovie
    },
    {
        name: "searchSeries",
        description: "Busca información actualizada de una serie en TMDB",
        parameters: { name: "string" },
        execute: searchSeries
    },
    {
        name: "getSeriesDetails",
        description: "Obtiene detalles de una serie incluyendo siguiente episodio y temporadas",
        parameters: { seriesId: "number" },
        execute: getSeriesDetails
    },
    {
        name: "getMoviesInTheaters",
        description: "Obtiene las películas que están actualmente en cartelera",
        parameters: {},
        execute: getMoviesInTheaters
    },
    {
        name: "getUpcomingMovies",
        description: "Obtiene los próximos estrenos de cine",
        parameters: {},
        execute: getUpcomingMovies
    },
    {
        name: "getStreamingProviders",
        description: "Busca dónde ver una película o serie (plataformas de streaming, alquiler, compra). Busca automáticamente por nombre.",
        parameters: { title: "string (nombre de la película/serie)", type: "'movie' | 'tv' (por defecto 'tv')" },
        execute: getStreamingProviders
    },
    {
        name: "navigateToPage",
        description: "Navega a una sección específica de la aplicación",
        parameters: { route: "string (ej: 'acción', 'populares', 'favoritos')" },
        execute: navigateToPage
    }
];

/**
 * Genera el contexto de funciones disponibles para la IA
 */
export function getFunctionsContext(): string {
    let context = "\n\n# 🔧 IMPORTANTE - Funciones disponibles:\n\n";
    context += "Tienes acceso a estas funciones para obtener información en tiempo real:\n\n";
    
    context += "1. **getStreamingProviders(title, type)**: Busca dónde ver una película/serie\n";
    context += "   - Ejemplo: USE_FUNCTION: getStreamingProviders(\"Breaking Bad\", \"tv\")\n";
    context += "   - Ejemplo: USE_FUNCTION: getStreamingProviders(\"Inception\", \"movie\")\n\n";
    
    context += "2. **getMoviesInTheaters()**: Películas en cartelera ahora\n";
    context += "   - Ejemplo: USE_FUNCTION: getMoviesInTheaters()\n\n";
    
    context += "3. **getUpcomingMovies()**: Próximos estrenos\n";
    context += "   - Ejemplo: USE_FUNCTION: getUpcomingMovies()\n\n";
    
    context += "4. **searchMovie(title)**: Buscar info de una película\n";
    context += "   - Ejemplo: USE_FUNCTION: searchMovie(\"Oppenheimer\")\n\n";
    
    context += "5. **searchSeries(name)**: Buscar info de una serie\n";
    context += "   - Ejemplo: USE_FUNCTION: searchSeries(\"Game of Thrones\")\n\n";
    
    context += "6. **navigateToPage(route)**: Llevar al usuario a una sección\n";
    context += "   - Rutas válidas: acción, comedia, drama, terror, ciencia ficción, romance, populares, estrenos, cartelera, top películas, top series, favoritos, pendientes, vistos, me gusta\n";
    context += "   - Ejemplo: USE_FUNCTION: navigateToPage(\"acción\")\n\n";
    
    context += "⚠️ REGLAS IMPORTANTES:\n";
    context += "- SIEMPRE usa estas funciones cuando el usuario pregunte algo que requiera datos actuales de TMDB\n";
    context += "- Para streaming, usa getStreamingProviders con el nombre exacto\n";
    context += "- Para navegación, usa navigateToPage con la ruta exacta\n";
    context += "- El formato debe ser EXACTAMENTE: USE_FUNCTION: nombreFuncion(parametro1, parametro2)\n";
    context += "- Los strings deben ir entre comillas dobles\n\n";
    
    context += "🎬 FORMATO DE PELÍCULAS Y SERIES:\n";
    context += "- Cuando menciones una película o serie en tu respuesta, usa el formato que recibes de las funciones\n";
    context += "- Las funciones devuelven un campo 'formatted' con el formato [MOVIE:id:título] o [SERIE:id:título]\n";
    context += "- SIEMPRE usa este formato cuando menciones contenido, por ejemplo:\n";
    context += "  'Te recomiendo ver [MOVIE:123:Inception]' en lugar de 'Te recomiendo ver Inception'\n";
    context += "  '[SERIE:456:Breaking Bad] está disponible en Netflix'\n";
    context += "- Esto hará que los nombres aparezcan como badges clickeables para el usuario\n\n";
    
    return context;
}

/**
 * Ejecuta una función basada en el nombre y parámetros
 */
export async function executeFunction(functionName: string, params: any[]): Promise<any> {
    const func = availableFunctions.find(f => f.name === functionName);
    if (func) {
        return await func.execute(...params);
    }
    return { success: false, error: "Función no encontrada" };
}
