import { GoogleGenerativeAI } from "@google/generative-ai";
import { userContextService, type UserContext } from "./userContextService";
import { executeFunction, getFunctionsContext } from "./aiFunctions";

// Tipos para el chat
export interface Message {
    role: "user" | "model";
    content: string;
    timestamp: Date;
}

export interface ChatResponse {
    success: boolean;
    message?: string;
    error?: string;
}

class GeminiService {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;
    private chat: any = null;
    private apiKey: string;
    private requestCount: number = 0;
    private lastRequestTime: number = 0;
    private readonly MIN_REQUEST_INTERVAL = 1000; // Mínimo 1 segundo entre peticiones

    constructor() {
        // Obtener la API key desde las variables de entorno
        this.apiKey = import.meta.env.PUBLIC_GEMINI_API_KEY || "";
        
        if (!this.apiKey) {
            console.error("⚠️ PUBLIC_GEMINI_API_KEY no está configurada");
            throw new Error("API Key de Gemini no configurada. Verifica tu archivo .env");
        }

        this.initializeGemini();
    }

    /**
     * Esperar antes de hacer una petición para respetar rate limits
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            console.log(`⏳ Esperando ${waitTime}ms para respetar rate limit...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
        this.requestCount++;
        console.log(`📊 Petición #${this.requestCount} a Gemini API`);
    }

    /**
     * Inicializa el cliente de Gemini
     */
    private initializeGemini() {
        try {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            
            // Usar Gemini 2.0 Flash Lite con configuración optimizada para rate limits
            this.model = this.genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash-lite",
                generationConfig: {
                    temperature: 0.7, // Reducido de 0.9 para respuestas más predecibles
                    topK: 30,         // Reducido de 40
                    topP: 0.9,        // Reducido de 0.95
                    maxOutputTokens: 1024, // Reducido de 2048 para ahorrar tokens
                }
            });

            console.log("✅ Gemini AI inicializado correctamente con gemini-2.0-flash-lite (modo optimizado)");
        } catch (error) {
            console.error("❌ Error al inicializar Gemini:", error);
            throw error;
        }
    }

    /**
     * Inicia una nueva sesión de chat con contexto de YourFavs y datos del usuario
     */
    public async startChat(history: Message[] = [], includeUserContext: boolean = true) {
        if (!this.model) {
            throw new Error("Gemini no está inicializado");
        }

        // Contexto inicial para que Gemini sepa de qué trata la app
        let systemContext = `Eres un asistente experto en cine y series llamado "YourFavs Assistant". 
Tu función es ayudar a los usuarios a descubrir películas y series basándote en sus gustos.
Puedes recomendar contenido, responder preguntas sobre películas/series, actores, directores, géneros, etc.
Sé amigable, entusiasta y conciso en tus respuestas.

🔧 FUNCIONES DISPONIBLES - Tienes acceso a funciones para consultar datos en tiempo real:

📊 DATOS PERSONALES DEL USUARIO:
- El contexto inicial solo muestra 5 películas/series como muestra para ahorrar tokens
- NUNCA uses solo el contexto inicial para responder sobre las listas del usuario
- SIEMPRE usa las funciones de búsqueda para acceder a las listas COMPLETAS:
  • searchInFavoriteMovies() - Busca en TODAS las películas favoritas del usuario
  • searchInFavoriteSeries() - Busca en TODAS las series favoritas
  • searchInPendingMovies() - Busca en películas pendientes
  • searchInWatchedMovies() - Busca en películas vistas (incluye sus opiniones)
  • searchInLikedMovies() - Películas que le gustan
  • searchInLikedSeries() - Series que le gustan
  • searchInFavoriteActors() - Actores favoritos
  • getUserListsStats() - Obtiene estadísticas totales de todas las listas

⚠️ CRÍTICO - Cuando el usuario pregunte por SUS LISTAS:
   → "¿Cuáles son mis películas favoritas?" → USA searchInFavoriteMovies() SIEMPRE
   → "¿Cuáles son mis series favoritas?" → USA searchInFavoriteSeries() SIEMPRE
   → "¿Tengo X en favoritas?" → USA searchInFavoriteMovies/Series()
   → "Muéstrame más favoritas" → USA la función con limit mayor
   → "¿Cuántas películas tengo?" → USA getUserListsStats()
   → NO respondas basándote solo en el contexto inicial (solo tiene 5 items)

🎬 BÚSQUEDA EN TMDB:
- getSimilarMovies/Series() - Para películas/series similares
- searchMoviesByActor/Director() - Por actor o director
- getTrendingContent() - Contenido popular del momento
- getMovieReviews/getSeriesReviews() - Opiniones y reseñas de TMDB
- Y muchas más funciones avanzadas...

⚠️ PRIORIDAD EN RECOMENDACIONES:
1. Si el usuario pide películas/series "similares", "como", "del estilo de", "parecidas a" una película/serie específica:
   → USA SIEMPRE getSimilarMovies() o getSimilarSeries() para obtener recomendaciones de TMDB
   → NO uses solo las listas personales del usuario
   
2. Si el usuario pide recomendaciones generales ("qué puedo ver", "recomiéndame algo"):
   → Puedes combinar las listas personales del usuario con búsquedas en TMDB
   
3. Si el usuario pregunta por SUS listas ("qué tengo en favoritos", "qué he visto"):
   → USA searchInFavoriteMovies/Series() para acceder a sus listas completas
   
4. Si el usuario pregunta por opiniones/reseñas ("¿por qué X tiene malas críticas?", "¿qué rating tiene?"):
   → USA getMovieReviews() o getSeriesReviews() para obtener datos completos
   → Estas funciones devuelven RATINGS OFICIALES (IMDB, Rotten Tomatoes, Metacritic) + reseñas de usuarios
   → SIEMPRE menciona los ratings cuando estén disponibles (ej: "IMDB: 8.5/10 con 1.2M votos")
   → Explica el contexto basándote en los ratings y reseñas disponibles

Si el usuario pregunta algo que no está relacionado con cine/series, amablemente redirige la conversación al tema.`;

        // Añadir contexto de funciones disponibles
        systemContext += getFunctionsContext();

        // Obtener y añadir el contexto del usuario desde Firebase
        if (includeUserContext) {
            try {
                const userContext = await userContextService.getUserContext();
                const formattedUserContext = userContextService.formatContextForAI(userContext);
                systemContext += "\n\n" + formattedUserContext;
                console.log("✅ Contexto del usuario añadido al chat");
            } catch (error) {
                console.warn("⚠️ No se pudo obtener el contexto del usuario:", error);
                // Continuar sin el contexto del usuario
            }
        }

        // Convertir el historial al formato de Gemini
        const formattedHistory = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }]
        }));

        // Añadir el contexto del sistema al inicio
        const chatHistory = [
            {
                role: "user",
                parts: [{ text: systemContext }]
            },
            {
                role: "model",
                parts: [{ text: "¡Hola! 👋 Soy YourFavs Assistant. Tengo acceso a tus listas completas y puedo ayudarte con:\n\n✨ Buscar en tus películas/series favoritas, vistas y pendientes\n� Obtener reseñas y opiniones de TMDB\n�🔍 Buscar dónde ver cualquier película o serie\n📅 Estrenos y películas en cartelera\n🎯 Recomendaciones personalizadas basadas en tus gustos\n🧭 Navegar por la app (géneros, tops, etc.)\n\n💡 Puedes preguntarme cosas como:\n• \"¿Tengo Harry Potter en favoritas?\"\n• \"¿Qué opinan de The Witcher?\"\n• \"Recomiéndame películas como Interstellar\"\n• \"¿Cuántas películas tengo en mis listas?\"\n\n¿En qué puedo ayudarte hoy?" }]
            },
            ...formattedHistory
        ];

        this.chat = this.model.startChat({
            history: chatHistory,
        });

        return this.chat;
    }

    /**
     * Envía un mensaje al chat y obtiene la respuesta
     */
    public async sendMessage(message: string): Promise<ChatResponse> {
        // Esperar para respetar rate limits
        await this.waitForRateLimit();
        
        // Implementar retry con exponential backoff para errores 429
        const maxRetries = 3;
        const baseDelay = 2000; // 2 segundos
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (!this.chat) {
                    await this.startChat();
                }

                const result = await this.chat.sendMessage(message);
                const response = await result.response;
                let text = response.text();

                console.log("📝 Respuesta de IA:", text);

                // Detectar si la IA quiere usar una función (más flexible)
                const functionMatch = text.match(/USE_FUNCTION:\s*(\w+)\((.*?)\)/s);
                
                if (functionMatch) {
                    const functionName = functionMatch[1];
                    const paramsString = functionMatch[2];
                    
                    console.log(`🔧 Función detectada: ${functionName}`);
                    console.log(`📋 Parámetros: ${paramsString}`);
                    
                    // Parsear parámetros de forma más robusta
                    let params: any[] = [];
                    if (paramsString.trim()) {
                        // Detectar si es un array (para getAdvancedRecommendations)
                        if (paramsString.trim().startsWith('[')) {
                            try {
                                // Intentar parsear como JSON
                                const parsed = JSON.parse(paramsString);
                                params = [parsed];
                            } catch {
                                // Si falla, separar por comas manualmente
                                const arrayContent = paramsString.trim().slice(1, -1);
                                const arrayItems = arrayContent.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) || [];
                                params = [arrayItems.map((item: string) => 
                                    item.trim().replace(/^["']|["']$/g, '')
                                )];
                            }
                        } else {
                            // Separar por comas que no estén dentro de comillas
                            const paramMatches = paramsString.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) || [];
                            params = paramMatches.map((p: string) => {
                                const trimmed = p.trim().replace(/^["']|["']$/g, '');
                                // Verificar si es null o undefined
                                if (trimmed === 'null' || trimmed === 'undefined' || trimmed === '') {
                                    return undefined;
                                }
                                // Verificar si es un número
                                if (!isNaN(Number(trimmed)) && trimmed !== '') {
                                    return Number(trimmed);
                                }
                                // Verificar si es un booleano
                                if (trimmed === 'true') return true;
                                if (trimmed === 'false') return false;
                                return trimmed;
                            });
                        }
                    }

                    console.log(`✅ Parámetros parseados:`, params);
                    
                    // Ejecutar la función
                    const functionResult = await executeFunction(functionName, params);
                    
                    console.log(`📦 Resultado de función:`, functionResult);
                    
                    // Si es una navegación, retornar con flag especial
                    if (functionName === "navigateToPage" && functionResult.success) {
                        return {
                            success: true,
                            message: functionResult.message
                        };
                    }
                    
                    // Para otras funciones, enviar el resultado de vuelta a la IA
                    const followUpMessage = `Resultado de ${functionName}: ${JSON.stringify(functionResult, null, 2)}. 

IMPORTANTE: 
- Si el resultado incluye un campo 'formatted' (ejemplo: [MOVIE:123:Inception] o [SERIE:456:Breaking Bad]), DEBES usar ese formato en tu respuesta cuando menciones esa película o serie.
- Si el resultado es una lista con campo 'formatted' en cada elemento, usa esos formatos cuando menciones cada película/serie.
- El formato [MOVIE:id:título] se mostrará como un badge azul clickeable 🎬
- El formato [SERIE:id:título] se mostrará como un badge morado clickeable 📺
- Ejemplo: "Te recomiendo ver [MOVIE:550:Fight Club]" en lugar de "Te recomiendo ver Fight Club"

Por favor, responde al usuario de forma natural y amigable explicando esta información y usando los formatos especiales.`;
                    
                    const followUpResult = await this.chat.sendMessage(followUpMessage);
                    const followUpResponse = await followUpResult.response;
                    text = followUpResponse.text();
                }

                return {
                    success: true,
                    message: text
                };
                
            } catch (error: any) {
                console.error(`❌ Error al enviar mensaje (intento ${attempt + 1}/${maxRetries + 1}):`, error);
                
                // Verificar si es un error 429 (Rate Limit)
                const is429Error = error?.message?.includes('429') || 
                                  error?.message?.includes('Resource exhausted') ||
                                  error?.message?.includes('quota');
                
                if (is429Error && attempt < maxRetries) {
                    // Calcular delay con exponential backoff
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`⏳ Rate limit alcanzado. Reintentando en ${delay/1000} segundos...`);
                    
                    // Esperar antes de reintentar
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Reintentar
                }
                
                // Si no es 429 o ya agotamos los reintentos, manejar el error
                if (error?.message?.includes("API key")) {
                    return {
                        success: false,
                        error: "Error de autenticación. Verifica tu API Key."
                    };
                }
                
                if (is429Error) {
                    return {
                        success: false,
                        error: "Has alcanzado el límite de uso de la API. Por favor, espera unos minutos e intenta de nuevo. 💤"
                    };
                }

                return {
                    success: false,
                    error: error?.message || "Error al procesar el mensaje"
                };
            }
        }
        
        // Si llegamos aquí, agotamos todos los reintentos
        return {
            success: false,
            error: "Has alcanzado el límite de uso de la API después de varios intentos. Por favor, espera unos minutos. 💤"
        };
    }

    /**
     * Genera una recomendación basada en preferencias
     */
    public async getRecommendation(preferences: {
        genres?: string[];
        mood?: string;
        actors?: string[];
        type?: "movie" | "serie" | "both";
    }): Promise<ChatResponse> {
        const { genres = [], mood = "", actors = [], type = "both" } = preferences;

        let prompt = "Dame una recomendación de ";
        
        if (type === "movie") prompt += "película";
        else if (type === "serie") prompt += "serie";
        else prompt += "película o serie";

        if (genres.length > 0) {
            prompt += ` de los géneros: ${genres.join(", ")}`;
        }

        if (mood) {
            prompt += `. Estoy de humor para algo ${mood}`;
        }

        if (actors.length > 0) {
            prompt += `. Me gustan estos actores: ${actors.join(", ")}`;
        }

        prompt += ". Dame solo una recomendación específica con una breve explicación de por qué me gustaría.";

        return this.sendMessage(prompt);
    }

    /**
     * Obtiene información sobre una película o serie
     */
    public async getMediaInfo(title: string, type: "movie" | "serie"): Promise<ChatResponse> {
        const typeText = type === "movie" ? "película" : "serie";
        const prompt = `Cuéntame sobre la ${typeText} "${title}". Dame un resumen breve, los puntos destacados y por qué vale la pena verla.`;
        
        return this.sendMessage(prompt);
    }

    /**
     * Resetea la sesión de chat
     */
    public async resetChat() {
        this.chat = null;
        await this.startChat();
    }
}

// Exportar una instancia singleton
export const geminiService = new GeminiService();
