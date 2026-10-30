/**
 * Plataformas de streaming soportadas para "mis plataformas" (Auditoría v2 · 3.2).
 * `id` = provider_id de TMDB (para with_watch_providers). Misma lista que usa la
 * ruleta "¿Qué veo?" (WhatToWatch) y el filtro "Solo en mis plataformas" del catálogo.
 */
export interface StreamingPlatform {
    id: number;
    label: string;
    /** Mismo slug que `utils/constants/platforms.ts` → `/logos/plataformas/{slug}.svg`. */
    slug: string;
}

export const STREAMING_PLATFORMS: StreamingPlatform[] = [
    { id: 8, label: 'Netflix', slug: 'netflix' },
    { id: 119, label: 'Amazon Prime', slug: 'amazon' },
    { id: 337, label: 'Disney+', slug: 'disney' },
    { id: 1899, label: 'HBO Max', slug: 'hbo' },
    { id: 350, label: 'Apple TV+', slug: 'apple' },
    { id: 2241, label: 'Movistar+', slug: 'movistar' },
    { id: 63, label: 'Filmin', slug: 'filmin' },
];

/** Ruta del logo oficial (ya en `public/`, compartido con las páginas de catálogo). */
export function platformLogo(slug: string): string {
    return `/logos/plataformas/${slug}.svg`;
}

export const STREAMING_PLATFORM_IDS = new Set(STREAMING_PLATFORMS.map((p) => p.id));
