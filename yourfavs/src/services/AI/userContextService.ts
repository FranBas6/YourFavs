import { getMovieFav, getMoviesPendientes, getMoviesVistas, getLikedMovies } from "../BD/yourfavsMovie";
import { getSerieFav, getSeriesPendientes, getSeriesVistas, getLikedSeries } from "../BD/yourfavsSerie";
import { getActorsFav } from "../BD/yourfavsActor";

export interface UserContext {
    moviesFavoritas: any[];
    moviesPendientes: any[];
    moviesVistas: any[];
    moviesMeGusta: any[];
    seriesFavoritas: any[];
    seriesPendientes: any[];
    seriesVistas: any[];
    seriesMeGusta: any[];
    actoresFavoritos: any[];
}

/**
 * Servicio para obtener el contexto completo del usuario desde Firebase
 */
class UserContextService {
    private cachedContext: UserContext | null = null;
    private lastFetch: number = 0;
    private CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

    /**
     * Obtiene todo el contexto del usuario desde Firebase
     */
    async getUserContext(forceRefresh: boolean = false): Promise<UserContext> {
        const now = Date.now();
        
        // Usar caché si está disponible y no ha expirado
        if (!forceRefresh && this.cachedContext && (now - this.lastFetch < this.CACHE_DURATION)) {
            console.log("📦 Usando contexto en caché");
            return this.cachedContext;
        }

        console.log("🔄 Obteniendo contexto del usuario desde Firebase...");

        try {
            // Obtener todos los datos en paralelo para ser más rápido
            const [
                moviesFavoritas,
                moviesPendientes,
                moviesVistas,
                moviesMeGusta,
                seriesFavoritas,
                seriesPendientes,
                seriesVistas,
                seriesMeGusta,
                actoresFavoritos
            ] = await Promise.all([
                getMovieFav(),
                getMoviesPendientes(),
                getMoviesVistas(),
                getLikedMovies(),
                getSerieFav(),
                getSeriesPendientes(),
                getSeriesVistas(),
                getLikedSeries(),
                getActorsFav()
            ]);

            this.cachedContext = {
                moviesFavoritas,
                moviesPendientes,
                moviesVistas,
                moviesMeGusta,
                seriesFavoritas,
                seriesPendientes,
                seriesVistas,
                seriesMeGusta,
                actoresFavoritos
            };

            this.lastFetch = now;

            console.log("✅ Contexto del usuario obtenido:", {
                películasFavoritas: moviesFavoritas.length,
                películasPendientes: moviesPendientes.length,
                películasVistas: moviesVistas.length,
                películasMeGusta: moviesMeGusta.length,
                seriesFavoritas: seriesFavoritas.length,
                seriesPendientes: seriesPendientes.length,
                seriesVistas: seriesVistas.length,
                seriesMeGusta: seriesMeGusta.length,
                actoresFavoritos: actoresFavoritos.length
            });

            return this.cachedContext;
        } catch (error) {
            console.error("❌ Error al obtener contexto del usuario:", error);
            throw error;
        }
    }

    /**
     * Formatea el contexto del usuario en texto para Gemini
     */
    formatContextForAI(context: UserContext): string {
        let formattedContext = "# Información del perfil del usuario:\n\n";

        // Películas favoritas (solo 5 para ahorrar tokens)
        if (context.moviesFavoritas.length > 0) {
            formattedContext += "## Películas favoritas del usuario:\n";
            context.moviesFavoritas.slice(0, 5).forEach(movie => {
                formattedContext += `- [MOVIE:${movie.id}:${movie.title}] (${movie.release_date?.split('-')[0] || 'N/A'})`;
                if (movie.genres?.length) formattedContext += ` - ${movie.genres.slice(0, 2).join(', ')}`;
                formattedContext += "\n";
            });
            if (context.moviesFavoritas.length > 5) {
                formattedContext += `... y ${context.moviesFavoritas.length - 5} más.\n`;
            }
            formattedContext += "\n";
        }

        // Series favoritas (solo 5 para ahorrar tokens)
        if (context.seriesFavoritas.length > 0) {
            formattedContext += "## Series favoritas del usuario:\n";
            context.seriesFavoritas.slice(0, 5).forEach(serie => {
                formattedContext += `- [SERIE:${serie.id}:${serie.name}] (${serie.first_air_date?.split('-')[0] || 'N/A'})`;
                formattedContext += "\n";
            });
            if (context.seriesFavoritas.length > 5) {
                formattedContext += `... y ${context.seriesFavoritas.length - 5} más.\n`;
            }
            formattedContext += "\n";
        }

        // Películas vistas recientemente (solo 3)
        if (context.moviesVistas.length > 0) {
            formattedContext += "## Últimas películas vistas:\n";
            context.moviesVistas.slice(0, 3).forEach(movie => {
                formattedContext += `- [MOVIE:${movie.id}:${movie.title}]`;
                if (movie.opinion) formattedContext += ` - "${movie.opinion}"`;
                formattedContext += "\n";
            });
            formattedContext += "\n";
        }

        // Películas que me gustan recientemente (solo 5)
        if (context.moviesMeGusta.length > 0) {
            formattedContext += `## Películas que me gustan (${context.moviesMeGusta.length} total):\n`;
            formattedContext += "Las 5 más recientes:\n";
            context.moviesMeGusta.slice(0, 5).forEach(movie => {
                formattedContext += `- [MOVIE:${movie.id}:${movie.title}] (${movie.release_date?.split('-')[0] || 'N/A'})`;
                if (movie.added_at) {
                    const date = new Date(movie.added_at);
                    formattedContext += ` - Añadida: ${date.toLocaleDateString('es-ES')}`;
                }
                formattedContext += "\n";
            });
            formattedContext += "\n";
        }

        // Series vistas recientemente (solo 3)
        if (context.seriesVistas.length > 0) {
            formattedContext += "## Últimas series vistas:\n";
            context.seriesVistas.slice(0, 3).forEach(serie => {
                formattedContext += `- [SERIE:${serie.id}:${serie.name}]`;
                if (serie.opinion) formattedContext += ` - "${serie.opinion}"`;
                formattedContext += "\n";
            });
            formattedContext += "\n";
        }

        // Series que me gustan recientemente (solo 5)
        if (context.seriesMeGusta.length > 0) {
            formattedContext += `## Series que me gustan (${context.seriesMeGusta.length} total):\n`;
            formattedContext += "Las 5 más recientes:\n";
            context.seriesMeGusta.slice(0, 5).forEach(serie => {
                formattedContext += `- [SERIE:${serie.id}:${serie.name}] (${serie.first_air_date?.split('-')[0] || 'N/A'})`;
                if (serie.added_at) {
                    const date = new Date(serie.added_at);
                    formattedContext += ` - Añadida: ${date.toLocaleDateString('es-ES')}`;
                }
                formattedContext += "\n";
            });
            formattedContext += "\n";
        }

        // Películas pendientes (solo cantidad y 3 ejemplos)
        if (context.moviesPendientes.length > 0) {
            formattedContext += `## Películas pendientes: ${context.moviesPendientes.length} películas\n`;
            if (context.moviesPendientes.length <= 3) {
                formattedContext += context.moviesPendientes.map(m => `[MOVIE:${m.id}:${m.title}]`).join(", ");
            } else {
                formattedContext += context.moviesPendientes.slice(0, 3).map(m => `[MOVIE:${m.id}:${m.title}]`).join(", ");
                formattedContext += ` y ${context.moviesPendientes.length - 3} más`;
            }
            formattedContext += "\n\n";
        }

        // Series pendientes (solo cantidad y 3 ejemplos)
        if (context.seriesPendientes.length > 0) {
            formattedContext += `## Series pendientes: ${context.seriesPendientes.length} series\n`;
            if (context.seriesPendientes.length <= 3) {
                formattedContext += context.seriesPendientes.map(s => `[SERIE:${s.id}:${s.name}]`).join(", ");
            } else {
                formattedContext += context.seriesPendientes.slice(0, 3).map(s => `[SERIE:${s.id}:${s.name}]`).join(", ");
                formattedContext += ` y ${context.seriesPendientes.length - 3} más`;
            }
            formattedContext += "\n\n";
        }

        // Actores favoritos (solo cantidad)
        if (context.actoresFavoritos.length > 0) {
            formattedContext += `## Actores favoritos: ${context.actoresFavoritos.length} actores\n\n`;
        }

        formattedContext += "IMPORTANTE: \n";
        formattedContext += "- Usa esta info para recomendaciones personalizadas.\n";
        formattedContext += "- SIEMPRE mantén el formato [MOVIE:id:título] o [SERIE:id:título] cuando menciones contenido.\n";
        formattedContext += "- Esto hará que los nombres aparezcan como badges clickeables para el usuario.\n";

        return formattedContext;
    }

    /**
     * Limpia el caché (útil después de que el usuario agregue/elimine algo)
     */
    clearCache() {
        this.cachedContext = null;
        this.lastFetch = 0;
        console.log("🗑️ Caché del contexto limpiado");
    }
}

// Exportar instancia singleton
export const userContextService = new UserContextService();
