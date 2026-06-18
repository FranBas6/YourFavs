/**
 * Plataformas de streaming soportadas para "mis plataformas" (Auditoría v2 · 3.2).
 * `id` = provider_id de TMDB (para with_watch_providers). Misma lista que usa la
 * ruleta "¿Qué veo?" (WhatToWatch) y el filtro "Solo en mis plataformas" del catálogo.
 */
export interface StreamingPlatform {
    id: number;
    label: string;
}

export const STREAMING_PLATFORMS: StreamingPlatform[] = [
    { id: 8, label: 'Netflix' },
    { id: 119, label: 'Amazon Prime' },
    { id: 337, label: 'Disney+' },
    { id: 1899, label: 'HBO Max' },
    { id: 350, label: 'Apple TV+' },
    { id: 2241, label: 'Movistar+' },
    { id: 63, label: 'Filmin' },
];

export const STREAMING_PLATFORM_IDS = new Set(STREAMING_PLATFORMS.map((p) => p.id));
