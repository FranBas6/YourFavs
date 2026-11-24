/**
 * Nombre de una plataforma tal como se enseña (QA 8.7, H28): TMDB/JustWatch da algunas variantes en inglés
 * («Amazon Prime Video with Ads», «Netflix Standard with Ads»). Solo para pintar: el nombre original sigue
 * siendo la clave de los enlaces. El mismo cambio está, en una línea, en el script de StreamingProviders.
 */
export function providerLabel(name: string | null | undefined): string {
    return String(name ?? '').replace(/\s+with Ads$/i, ' con anuncios');
}
