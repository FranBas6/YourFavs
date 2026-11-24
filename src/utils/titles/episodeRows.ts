/**
 * Lo que necesitan las filas de episodio de la ficha de serie (`components/title/SeasonEpisodes.astro`),
 * tanto al pintar la ficha como al traer una temporada al abrirla (`pages/serie/[id]/episodios/[season]`,
 * QA 7.3). Puro: lo usan el servidor y, si hiciera falta, el navegador.
 */
import { formatDate } from './mediaHelpers';

/** Ajustes de «sin spoilers» del usuario, ya resueltos por el middleware (env.d.ts · `spoilers`). */
interface SpoilerSettings { enabled?: boolean; hideStills?: boolean; hideSynopsis?: boolean }

/**
 * Modo sin spoilers (§2), solo con sesión. La SERIE manda sobre el global (parada 2): si hay ajuste por
 * serie se usa; si no, el maestro del perfil (apagado por defecto). Qué se tapa sale del desglose global
 * (A3b): el ajuste por serie decide SI se tapa, no QUÉ.
 */
export function spoilerView(
    user: { spoilers?: SpoilerSettings } | null | undefined,
    seriesPref: boolean | null,
): { spoilerFree: boolean; hideStills: boolean; hideSynopsis: boolean } {
    const spoilerFree = !!user && (seriesPref !== null ? seriesPref : user.spoilers?.enabled === true);
    return {
        spoilerFree,
        hideStills: spoilerFree && user?.spoilers?.hideStills !== false,
        hideSynopsis: spoilerFree && user?.spoilers?.hideSynopsis !== false,
    };
}

export interface EpisodeMarkContext {
    /** Serie terminada o cancelada (`status` Ended/Canceled). */
    seriesIsOver: boolean;
    /** Número de la última temporada regular. */
    lastRegularSeasonNumber: number;
    /** Episodios de la temporada del episodio, para saber si es el último. */
    seasonEpisodes: any[];
}

/**
 * B2a (2026-10-29): marca de episodio según `episode_type` de TMDB («finale», «mid_season»). El último
 * episodio de la última temporada de una serie terminada es «FINAL DE SERIE». No es un spoiler: dice
 * dónde acaba la temporada, igual que el número de episodios.
 */
export function episodeMark(ep: any, ctx: EpisodeMarkContext): { label: string; title: string } | null {
    if (!ep) return null;
    if (ep.episode_type === 'finale') {
        const seasonEps = ctx.seasonEpisodes || [];
        const isLastOfSeries = ctx.seriesIsOver && ep.season_number === ctx.lastRegularSeasonNumber
            && ep.episode_number === seasonEps[seasonEps.length - 1]?.episode_number;
        return isLastOfSeries
            ? { label: 'FINAL DE SERIE', title: 'Último episodio de la serie' }
            : { label: 'FINAL', title: 'Último episodio de la temporada' };
    }
    if (ep.episode_type === 'mid_season') {
        return { label: 'PARÓN', title: 'Final de mitad de temporada: la temporada para y sigue más adelante' };
    }
    return null;
}

/** Dirección y guion de un episodio (vienen en `crew` de cada episodio). */
const EPISODE_WRITER_JOBS = ['Writer', 'Teleplay', 'Screenplay'];
export function episodeCredits(ep: any): { directors: string[]; writers: string[] } {
    const crew: any[] = ep?.crew || [];
    const names = (jobs: string[]) => [...new Set(crew.filter((c) => jobs.includes(c.job)).map((c) => c.name as string))];
    return { directors: names(['Director']), writers: names(EPISODE_WRITER_JOBS) };
}

/** Fecha corta de la fila de episodio en móvil («20 ago 2026»); la larga va en escritorio. */
export function shortAirDate(iso: string | null | undefined): string {
    if (!iso) return formatDate(iso as string);
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)).replace('.', '');
}
