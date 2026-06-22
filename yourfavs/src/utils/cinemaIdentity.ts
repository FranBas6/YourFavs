/**
 * Identidad cinéfila (apuesta ④ · "El salto"): deriva un ARQUETIPO con voz a
 * partir de las stats que ya calculamos (`yearStats` + racha). Reglas simples y
 * subjetivas a propósito — el objetivo es "esta app me conoce", no la precisión.
 *
 * Sin llamadas nuevas: todo sale de `YearStats` (de `calculateLifetimeStats`) +
 * `getMaxWatchStreak`. Catálogo de ~8 arquetipos con prioridad; el primero que
 * casa gana, y siempre hay un fallback.
 */
import { getGenreName } from './constants/genres';
import type { YearStats } from './yearStats';

export interface CinemaArchetype {
    name: string;
    description: string;
    icon: string;   // lucide
}

const INTENSE = [18, 53, 80, 9648, 27];          // drama, thriller, crimen, misterio, terror
const LIGHT = [35, 10751, 16, 10770, 10764];     // comedia, familia, animación, tv-movie, reality

export function deriveArchetype(stats: YearStats, maxStreak: number): CinemaArchetype {
    const titles = stats.moviesAdded + stats.seriesAdded;
    const topGenreId = stats.topGenres[0]?.id ?? null;
    const topGenreName = topGenreId != null ? getGenreName(topGenreId) : 'cine';

    const seriesLeaning = stats.seriesAdded >= stats.moviesAdded && stats.seriesAdded > 0;
    const epHeavy = stats.episodesWatched >= 80;
    const intenseTop = topGenreId != null && INTENSE.includes(topGenreId);
    const lightTop = topGenreId != null && LIGHT.includes(topGenreId);

    // Idiomas: ¿más allá de Hollywood? (proporción de no-inglés)
    const langTotal = stats.byLanguage.reduce((n, l) => n + l.count, 0) || 1;
    const enCount = stats.byLanguage.find((l) => l.code === 'en')?.count ?? 0;
    const nonEnRatio = 1 - enCount / langTotal;

    // Década dominante (la de más títulos, ignorando desconocidas)
    const topDecade = [...stats.byDecade]
        .filter((d) => d.decade !== 'Desconocido')
        .sort((a, b) => b.count - a.count)[0]?.decade ?? null;
    const oldSoul = !!topDecade && /^(19[0-9]0s|19\d0)/.test(topDecade) && !/^199/.test(topDecade);

    const loyalDirector = (stats.topDirectors[0]?.count ?? 0) >= 4;
    const directorName = stats.topDirectors[0]?.name ?? '';

    const rc = stats.ratingCompare;
    const diff = rc ? rc.userAvg - rc.tmdbAvg : 0;
    const generous = !!rc && diff >= 0.5;
    const demanding = !!rc && diff <= -0.5;

    // --- prioridad: del rasgo más distintivo al más genérico ---
    if (maxStreak >= 7 && epHeavy && seriesLeaning && intenseTop) {
        return { name: 'El Maratoniano de Autor', icon: 'flame',
            description: `Series intensas que terminas a toda velocidad: rachas de hasta ${maxStreak} días y el ${topGenreName.toLowerCase()} como bandera.` };
    }
    if (epHeavy && seriesLeaning) {
        return { name: 'El Devorador de Series', icon: 'tv',
            description: `${stats.episodesWatched} episodios y subiendo. Cuando una serie te engancha, no hay quien te pare.` };
    }
    if (loyalDirector) {
        return { name: 'El Cinéfilo de Autor', icon: 'clapperboard',
            description: `Sigues a los cineastas, no solo a las películas${directorName ? ` — ${directorName} lo sabe bien` : ''}. ${topGenreName} con mirada de autor.` };
    }
    if (nonEnRatio >= 0.4) {
        return { name: 'El Trotamundos del Cine', icon: 'globe',
            description: `Lo tuyo no es solo Hollywood: buscas historias en cualquier idioma. ${topGenreName} sin fronteras.` };
    }
    if (oldSoul) {
        return { name: 'El Alma Nostálgica', icon: 'sparkles',
            description: `Tu corazón vive en los ${topDecade}: clásicos antes que novedades, y un buen ${topGenreName.toLowerCase()} que aguante el paso del tiempo.` };
    }
    if (intenseTop) {
        return { name: 'El Buscador de Intensidad', icon: 'zap',
            description: `Drama, tensión y giros: el ${topGenreName.toLowerCase()} es tu terreno. No ves para relajarte, ves para sentir.` };
    }
    if (lightTop) {
        return { name: 'El de Domingo por la Tarde', icon: 'coffee',
            description: `Ver cine es tu plan para desconectar: ${topGenreName.toLowerCase()} que entra solo, sin complicaciones.` };
    }
    if (demanding) {
        return { name: 'El Crítico Exigente', icon: 'scale',
            description: `Puntúas por debajo de la media (${diff.toFixed(1)} vs TMDB): contigo hay que ganarse cada estrella.` };
    }
    if (generous) {
        return { name: 'El Entusiasta Generoso', icon: 'heart',
            description: `Disfrutas casi todo lo que ves (+${diff.toFixed(1)} sobre la media de TMDB): ver cine te hace feliz y se nota.` };
    }
    return { name: 'El Explorador Curioso', icon: 'compass',
        description: `${titles} títulos de todo tipo: lo tuyo es no encasillarte. Un poco de ${topGenreName.toLowerCase()}, un poco de todo.` };
}
