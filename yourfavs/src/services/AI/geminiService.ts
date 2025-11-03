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
     * Inicializa el cliente de Gemini
     */
    private initializeGemini() {
        try {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            
            // Usar Gemini 2.0 Flash Lite (más cuota disponible)
            this.model = this.genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash-lite",
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048,
                }
            });

            console.log("✅ Gemini AI inicializado correctamente con gemini-2.0-flash-lite");
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

IMPORTANTE: Tienes acceso a funciones para consultar datos en tiempo real de TMDB.
- Cuando el usuario pregunte "¿Dónde puedo ver X?", DEBES usar getStreamingProviders
- Cuando el usuario pregunte por estrenos o cartelera, DEBES usar las funciones correspondientes
- Cuando el usuario pida ir a una sección, DEBES usar navigateToPage

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
                parts: [{ text: "¡Hola! 👋 Soy YourFavs Assistant. Conozco tus gustos y puedo ayudarte con:\n\n✨ Tus películas/series favoritas, vistas y pendientes\n🔍 Buscar dónde ver cualquier película o serie\n📅 Estrenos y películas en cartelera\n🧭 Navegar por la app (géneros, tops, etc.)\n💡 Recomendaciones personalizadas\n\n¿En qué puedo ayudarte hoy?" }]
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
                    // Separar por comas que no estén dentro de comillas
                    const paramMatches = paramsString.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) || [];
                    params = paramMatches.map((p: string) => {
                        const trimmed = p.trim().replace(/^["']|["']$/g, '');
                        // Verificar si es un número
                        if (!isNaN(Number(trimmed)) && trimmed !== '') {
                            return Number(trimmed);
                        }
                        return trimmed;
                    });
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
            console.error("❌ Error al enviar mensaje:", error);
            
            // Manejo de errores específicos
            if (error?.message?.includes("API key")) {
                return {
                    success: false,
                    error: "Error de autenticación. Verifica tu API Key."
                };
            }
            
            if (error?.message?.includes("quota")) {
                return {
                    success: false,
                    error: "Has alcanzado el límite de uso. Intenta más tarde."
                };
            }

            return {
                success: false,
                error: error?.message || "Error al procesar el mensaje"
            };
        }
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
