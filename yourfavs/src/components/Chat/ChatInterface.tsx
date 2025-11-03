import { useState, useRef, useEffect } from "react";
import { geminiService, type Message } from "../../services/AI/geminiService";

// Función para renderizar contenido con badges clickeables de películas/series
function renderMessageContent(content: string) {
    // Regex para detectar [MOVIE:id:título] o [SERIE:id:título]
    const regex = /\[(MOVIE|SERIE):(\d+):([^\]]+)\]/g;
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        // Añadir texto antes del match
        if (match.index > lastIndex) {
            parts.push(content.substring(lastIndex, match.index));
        }

        const type = match[1]; // MOVIE o SERIE
        const id = match[2];
        const title = match[3];
        const route = type === "MOVIE" ? `/movie/${id}` : `/serie/${id}`;

        // Añadir badge clickeable
        parts.push(
            <a
                key={`${type}-${id}-${match.index}`}
                href={route}
                className={`inline-flex items-center gap-1 px-3 py-1 mx-1 rounded-full text-sm font-semibold transition-all hover:scale-105 hover:shadow-lg ${
                    type === "MOVIE"
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600"
                        : "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600"
                }`}
                onClick={(e) => {
                    e.preventDefault();
                    window.location.href = route;
                }}
            >
                <span>{type === "MOVIE" ? "🎬" : "📺"}</span>
                <span>{title}</span>
            </a>
        );

        lastIndex = regex.lastIndex;
    }

    // Añadir texto restante
    if (lastIndex < content.length) {
        parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
}

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "model",
            content: "¡Hola! 👋 Soy YourFavs Assistant. Conozco tus gustos y puedo ayudarte con:\n\n✨ Tus películas/series favoritas, vistas y pendientes\n� Buscar dónde ver cualquier película o serie\n📅 Estrenos y películas en cartelera\n🧭 Navegar por la app (géneros, tops, etc.)\n💡 Recomendaciones personalizadas\n\n¿En qué puedo ayudarte hoy?",
            timestamp: new Date()
        }
    ]);
    const [inputMessage, setInputMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showQuickQuestions, setShowQuickQuestions] = useState(false);
    const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
    const [isRefreshingContext, setIsRefreshingContext] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al último mensaje
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        // Solo hacer scroll si hay más de un mensaje (evita scroll en carga inicial)
        if (messages.length > 1) {
            scrollToBottom();
        }
    }, [messages]);

    // Cerrar desplegable al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (showQuickQuestions && !target.closest('.quick-questions-container')) {
                setShowQuickQuestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showQuickQuestions]);

    // Iniciar el chat al montar el componente
    useEffect(() => {
        async function initChat() {
            try {
                await geminiService.startChat(messages, true); // true = incluir contexto del usuario
                console.log("✅ Chat inicializado con contexto del usuario");
            } catch (err: any) {
                setError(err.message || "Error al inicializar el chat");
            }
        }
        initChat();
    }, []);

    // Función para refrescar el contexto del usuario y reiniciar la conversación
    const refreshContext = async () => {
        setIsRefreshingContext(true);
        try {
            // Forzar actualización del contexto desde Firebase
            const { userContextService } = await import("../../services/AI/userContextService");
            userContextService.clearCache();
            
            // Limpiar todos los mensajes de la conversación
            setMessages([]);
            
            // Reiniciar el chat con el nuevo contexto (sin mensajes previos)
            await geminiService.startChat([], true);
            console.log("✅ Contexto del usuario actualizado y conversación reiniciada");
        } catch (err) {
            console.error("❌ Error al actualizar contexto:", err);
        } finally {
            setIsRefreshingContext(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!inputMessage.trim() || isLoading) return;

        const userMessage: Message = {
            role: "user",
            content: inputMessage.trim(),
            timestamp: new Date()
        };

        // Detectar si el usuario pregunta sobre "lo último" o "reciente"
        const needsContextRefresh = /último|última|últimamente|reciente|recientemente|añadí|agregué|vi ayer|vi hoy/i.test(inputMessage);
        
        if (needsContextRefresh && !isRefreshingContext) {
            console.log("🔄 Detectada pregunta sobre contenido reciente, actualizando contexto...");
            await refreshContext();
        }

        // Añadir mensaje del usuario
        setMessages(prev => [...prev, userMessage]);
        setInputMessage("");
        setIsLoading(true);
        setError(null);

        try {
            // Enviar mensaje a Gemini
            const response = await geminiService.sendMessage(userMessage.content);

            if (response.success && response.message) {
                // Detectar si es un comando de navegación
                if (response.message.startsWith("NAVIGATE_TO:")) {
                    const route = response.message.replace("NAVIGATE_TO:", "");
                    
                    // Mostrar mensaje temporal de navegación
                    const navMessage: Message = {
                        role: "model",
                        content: `🧭 Te llevo a esa sección...`,
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, navMessage]);
                    
                    // Navegar después de un breve delay
                    setTimeout(() => {
                        window.location.href = route;
                    }, 500);
                    
                    return;
                }
                
                const aiMessage: Message = {
                    role: "model",
                    content: response.message,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMessage]);
            } else {
                // Personalizar mensajes de error
                let errorMessage = response.error || "Error al obtener respuesta";
                
                // Detectar error 429 (límite de cuota)
                if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exhausted")) {
                    errorMessage = "⏰ Has alcanzado el límite de peticiones. Esperando 60 segundos antes de reintentar automáticamente...";
                    setError(errorMessage);
                    
                    // Iniciar cuenta regresiva
                    startRetryCountdown(userMessage.content);
                    return; // Salir para que no se ejecute el setError de abajo
                }
                // Detectar error de API key
                else if (errorMessage.includes("API key") || errorMessage.includes("authentication")) {
                    errorMessage = "🔑 Hay un problema con la configuración. Por favor, contacta al administrador.";
                }
                // Detectar error de red
                else if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
                    errorMessage = "🌐 Error de conexión. Verifica tu conexión a internet e intenta de nuevo.";
                }
                
                setError(errorMessage);
            }
        } catch (err: any) {
            // Manejar errores no capturados
            let errorMessage = "Error al enviar el mensaje";
            
            if (err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("exhausted")) {
                errorMessage = "⏰ Has alcanzado el límite de peticiones. Por favor, espera 1-2 minutos antes de continuar.";
            } else if (err.message) {
                errorMessage = err.message;
            }
            
            setError(errorMessage);
            console.error("Error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickQuestion = async (question: string) => {
        setInputMessage(question);
        setShowQuickQuestions(false); // Cerrar el desplegable
        
        // Crear mensaje del usuario
        const userMessage: Message = {
            role: "user",
            content: question,
            timestamp: new Date()
        };

        // Añadir mensaje del usuario
        setMessages(prev => [...prev, userMessage]);
        setInputMessage("");
        setIsLoading(true);
        setError(null);

        try {
            // Enviar mensaje a Gemini
            const response = await geminiService.sendMessage(userMessage.content);

            if (response.success && response.message) {
                const aiMessage: Message = {
                    role: "model",
                    content: response.message,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMessage]);
            } else {
                // Personalizar mensajes de error
                let errorMessage = response.error || "Error al obtener respuesta";
                
                // Detectar error 429 (límite de cuota)
                if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exhausted")) {
                    errorMessage = "⏰ Has alcanzado el límite de peticiones. Esperando 60 segundos antes de reintentar automáticamente...";
                    setError(errorMessage);
                    
                    // Iniciar cuenta regresiva
                    startRetryCountdown(userMessage.content);
                    return;
                }
                // Detectar error de API key
                else if (errorMessage.includes("API key") || errorMessage.includes("authentication")) {
                    errorMessage = "🔑 Hay un problema con la configuración. Por favor, contacta al administrador.";
                }
                // Detectar error de red
                else if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
                    errorMessage = "🌐 Error de conexión. Verifica tu conexión a internet e intenta de nuevo.";
                }
                
                setError(errorMessage);
            }
        } catch (err: any) {
            // Manejar errores no capturados
            let errorMessage = "Error al enviar el mensaje";
            
            if (err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("exhausted")) {
                errorMessage = "⏰ Has alcanzado el límite de peticiones. Por favor, espera 1-2 minutos antes de continuar.";
            } else if (err.message) {
                errorMessage = err.message;
            }
            
            setError(errorMessage);
            console.error("Error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Función para iniciar cuenta regresiva y reintentar
    const startRetryCountdown = (messageContent: string) => {
        let countdown = 60;
        setRetryCountdown(countdown);
        
        const interval = setInterval(() => {
            countdown--;
            setRetryCountdown(countdown);
            
            if (countdown <= 0) {
                clearInterval(interval);
                setRetryCountdown(null);
                setError(null);
                // Reintentar automáticamente
                retryMessage(messageContent);
            }
        }, 1000);
    };

    // Función para reintentar el envío del mensaje
    const retryMessage = async (messageContent: string) => {
        setIsLoading(true);
        
        try {
            const response = await geminiService.sendMessage(messageContent);
            
            if (response.success && response.message) {
                const aiMessage: Message = {
                    role: "model",
                    content: response.message,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMessage]);
            } else {
                setError(response.error || "Error al obtener respuesta");
            }
        } catch (err: any) {
            setError(err.message || "Error al enviar el mensaje");
        } finally {
            setIsLoading(false);
        }
    };

    const quickQuestions = [
        "¿Cuáles son mis películas favoritas?",
        "¿Qué es lo último que he añadido a me gusta?",
        "¿Qué películas están en cartelera ahora?",
        "Llévame a las películas de acción",
        "Recomiéndame una serie para ver esta noche",
        "Muéstrame los próximos estrenos",
        "¿Qué tengo pendiente de ver?",
        "Recomiéndame algo basado en mis gustos"
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-200px)] min-h-[500px] md:min-h-[600px] max-w-6xl mx-auto bg-gray-900 rounded-lg shadow-2xl overflow-hidden">
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
                @keyframes spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                
                /* Ocultar scrollbar pero mantener funcionalidad */
                .hide-scrollbar {
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE y Edge */
                }
                .hide-scrollbar::-webkit-scrollbar {
                    display: none; /* Chrome, Safari y Opera */
                }
                
                /* Estilos específicos para móviles */
                @media (max-width: 768px) {
                    .chat-message {
                        max-width: 90% !important;
                        padding: 0.75rem !important;
                        font-size: 0.9rem;
                    }
                    .chat-emoji {
                        font-size: 1.25rem !important;
                    }
                    .chat-timestamp {
                        font-size: 0.7rem !important;
                    }
                }
            `}</style>
            
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-3 md:p-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <h2 className="text-lg md:text-2xl font-bold text-white flex items-center gap-2">
                            <span>🤖</span>
                            <span className="hidden sm:inline">YourFavs Assistant</span>
                            <span className="sm:hidden">Assistant</span>
                        </h2>
                        <p className="text-purple-100 text-xs md:text-sm mt-1">
                            <span className="hidden sm:inline">Tu experto personal en películas y series</span>
                            <span className="sm:hidden">Chat con IA</span>
                        </p>
                    </div>
                    <button
                        onClick={refreshContext}
                        disabled={isRefreshingContext || isLoading}
                        className="bg-white/20 hover:bg-white/30 text-white px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 md:gap-2"
                        title="Actualizar mi información desde Firebase"
                    >
                        <span className={isRefreshingContext ? "animate-spin" : ""}>🔄</span>
                        <span className="hidden sm:inline">Actualizar</span>
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4 bg-gray-800">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`chat-message max-w-[85%] md:max-w-[80%] rounded-lg p-3 md:p-4 ${
                                msg.role === "user"
                                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                                    : "bg-gray-700 text-gray-100"
                            }`}
                        >
                            <div className="flex items-start gap-2">
                                <span className="chat-emoji text-lg md:text-xl">
                                    {msg.role === "user" ? "👤" : "🤖"}
                                </span>
                                <div className="flex-1">
                                    <p className="text-xs md:text-sm font-medium mb-1">
                                        {msg.role === "user" ? "Tú" : "Assistant"}
                                    </p>
                                    <div className="whitespace-pre-wrap text-sm md:text-base">
                                        {renderMessageContent(msg.content)}
                                    </div>
                                    <p className="chat-timestamp text-xs opacity-70 mt-2">
                                        {msg.timestamp.toLocaleTimeString('es-ES', { 
                                            hour: '2-digit', 
                                            minute: '2-digit' 
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-700 rounded-lg p-4 max-w-[80%]">
                            <div className="flex items-center gap-2 text-gray-300">
                                <div className="flex gap-1">
                                    <span className="animate-bounce">●</span>
                                    <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                                </div>
                                <span>Pensando...</span>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mx-2 mb-2">
                        <div className={`rounded-lg p-4 ${
                            error.includes("⏰") 
                                ? "bg-yellow-500/20 border border-yellow-500 text-yellow-200"
                                : error.includes("🔑")
                                ? "bg-orange-500/20 border border-orange-500 text-orange-200"
                                : "bg-red-500/20 border border-red-500 text-red-200"
                        }`}>
                            <div className="flex items-start gap-2">
                                <div className="flex-1">
                                    <p className="text-sm whitespace-pre-wrap">{error}</p>
                                    {retryCountdown !== null && (
                                        <div className="mt-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                                                    <div 
                                                        className="bg-yellow-400 h-full transition-all duration-1000"
                                                        style={{ width: `${(retryCountdown / 60) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-mono">{retryCountdown}s</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        setError(null);
                                        setRetryCountdown(null);
                                    }}
                                    className="text-xs opacity-70 hover:opacity-100 transition-opacity"
                                    title="Cerrar"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area con desplegable de preguntas rápidas */}
            <form onSubmit={handleSendMessage} className="bg-gray-900 border-t border-gray-700 p-2 md:p-4">
                {/* Desplegable de preguntas rápidas */}
                <div className="mb-2 md:mb-3 relative quick-questions-container">
                    <button
                        type="button"
                        onClick={() => setShowQuickQuestions(!showQuickQuestions)}
                        className="flex items-center gap-2 text-xs md:text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        <span>💡</span>
                        <span className="hidden sm:inline">Preguntas rápidas</span>
                        <span className="sm:hidden">Preguntas</span>
                        <span className={`transition-transform ${showQuickQuestions ? 'rotate-180' : ''}`}>
                            ▼
                        </span>
                    </button>
                    
                    {showQuickQuestions && (
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10 animate-fade-in">
                            <div className="max-h-48 md:max-h-60 overflow-y-auto">
                                {quickQuestions.map((question, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => handleQuickQuestion(question)}
                                        className="w-full text-left px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-200 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
                                        disabled={isLoading}
                                    >
                                        <span className="mr-2">💬</span>
                                        {question}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Input de mensaje */}
                <div className="flex gap-2 items-end">
                    <textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                            // Enviar con Enter, nueva línea con Shift+Enter
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e as any);
                            }
                        }}
                        placeholder="Escribe tu pregunta..."
                        className="flex-1 bg-gray-800 text-white border border-gray-700 rounded-lg px-3 md:px-4 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent resize-none overflow-y-auto min-h-[44px] max-h-32 hide-scrollbar"
                        disabled={isLoading}
                        rows={1}
                        style={{
                            height: 'auto',
                            minHeight: '44px',
                        }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !inputMessage.trim()}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg text-sm md:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? "..." : <span className="hidden sm:inline">Enviar</span>}
                        {isLoading ? "" : <span className="sm:hidden">📤</span>}
                    </button>
                </div>
            </form>
        </div>
    );
}
