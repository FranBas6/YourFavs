/**
 * Idiomas de contenido soportados (subconjunto razonable de TMDB).
 *
 * Es el idioma de **sinopsis y títulos** que pide `tmdbFetch`, no el de la interfaz.
 * Vivía en el frontmatter de `perfil.astro`; se extrae aquí para que la sección de
 * Ajustes y la validación del endpoint usen la misma lista.
 */
export interface ContentLanguage {
    code: string;
    label: string;
}

export const CONTENT_LANGUAGES: ContentLanguage[] = [
    { code: 'es-ES', label: 'Español' },
    { code: 'en-US', label: 'English' },
    { code: 'fr-FR', label: 'Français' },
    { code: 'de-DE', label: 'Deutsch' },
    { code: 'it-IT', label: 'Italiano' },
    { code: 'pt-BR', label: 'Português (BR)' },
    { code: 'ja-JP', label: '日本語' },
];

export const CONTENT_LANGUAGE_CODES = new Set(CONTENT_LANGUAGES.map((l) => l.code));

export const DEFAULT_CONTENT_LANGUAGE = 'es-ES';
