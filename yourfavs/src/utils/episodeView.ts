/**
 * Cálculos de la ficha de episodio (TMDB D4) que no dependen de Astro: si se ha emitido, la cuenta
 * atrás, las etiquetas y los textos de fecha. Todo en hora de Madrid (`APP_TZ`): TMDB solo da el DÍA
 * de emisión, y «hoy» es el día de Madrid.
 */
import { APP_TZ, appDateParts } from './appTime';

export type AirState = 'aired' | 'today' | 'soon';

/** «YYYY-MM-DD» de hoy en Madrid. */
export const todayKey = (now = Date.now()) => appDateParts(now).key;

/** Días entre dos «YYYY-MM-DD» (b − a), sin que el horario de verano mueva nada. */
export function daysBetween(a: string, b: string): number {
    const t = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Sin fecha cuenta como «sin emitir»: TMDB anuncia episodios antes de tener el día. */
export function airState(airDate: string | null | undefined, today = todayKey()): AirState {
    if (!airDate) return 'soon';
    if (airDate === today) return 'today';
    return airDate < today ? 'aired' : 'soon';
}

const at = (key: string) => new Date(`${key}T12:00:00Z`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Dom 19 jun 2011» (cabecera). */
export function shortDate(key: string): string {
    const p = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .formatToParts(at(key));
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${capital(v('weekday').replace('.', ''))} ${v('day')} ${v('month').replace('.', '')} ${v('year')}`;
}

/** «Domingo 1 de noviembre» (cuenta atrás; con año si no es el actual). */
export function longDate(key: string, today = todayKey()): string {
    const sameYear = key.slice(0, 4) === today.slice(0, 4);
    const s = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
    }).format(at(key));
    return capital(s.replace(',', ''));
}

/** «Dom 8 nov» (estado de anterior / siguiente sin emitir). */
export function tinyDate(key: string): string {
    return shortDate(key).replace(/ \d{4}$/, '');
}

/** Cuenta atrás del marco: «2 días», «mañana», «hoy». */
export function countdown(airDate: string, today = todayKey()): { n: string; unit: string; label: string } {
    const d = daysBetween(today, airDate);
    if (d <= 0) return { n: 'hoy', unit: '', label: 'hoy' };
    if (d === 1) return { n: 'mañana', unit: '', label: 'mañana' };
    return { n: String(d), unit: 'días', label: `${d} días` };
}

/** «53 min» · «1 h 2 min». */
export function runtimeLabel(min: number | null | undefined): string | null {
    if (!min || min <= 0) return null;
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/** Nota con coma decimal: «8,8». */
export const decimal = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «Lo viste el 12 mar 2024 a las 21:40» (Madrid). */
export function watchedLabel(iso: string): string {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TZ }).format(d).replace('.', '');
    const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: APP_TZ }).format(d);
    return `${day} a las ${time}`;
}

/**
 * ¿El título es el provisional de TMDB? Sin traducir ni anunciar, TMDB devuelve «Episodio 5» (o
 * «Episode 5») o nada.
 */
export function isPlaceholderTitle(name: string | null | undefined, episode: number): boolean {
    const n = (name ?? '').trim();
    return !n || new RegExp(`^(episodio|episode|épisode|folge)\\s*${episode}$`, 'i').test(n);
}

export type EpisodeTag = 'final' | 'seriesEnd' | 'mid' | 'special' | 'soon' | 'today';

/** Etiquetas de la cabecera, en orden. «FINAL» y «PARÓN» no son spoilers (dicen dónde acaba la temporada). */
export function episodeTags(o: {
    season: number;
    episodeType: string | null | undefined;
    isLastOfSeries: boolean;
    seriesEnded: boolean;
    air: AirState;
}): EpisodeTag[] {
    const tags: EpisodeTag[] = [];
    if (o.season === 0) tags.push('special');
    if (o.episodeType === 'finale') tags.push(o.isLastOfSeries && o.seriesEnded ? 'seriesEnd' : 'final');
    else if (o.episodeType === 'mid_season') tags.push('mid');
    if (o.air === 'soon') tags.push('soon');
    if (o.air === 'today') tags.push('today');
    return tags;
}

export const TAG_STYLE: Record<EpisodeTag, { color: string; icon: string; label: string }> = {
    final: { color: 'amber', icon: 'flag', label: 'Final' },
    seriesEnd: { color: 'red', icon: 'flag', label: 'Final de serie' },
    mid: { color: 'slate', icon: 'pause', label: 'Parón' },
    special: { color: 'purple', icon: 'sparkles', label: 'Especial' },
    soon: { color: 'blue', icon: 'calendar-clock', label: 'Sin emitir' },
    today: { color: 'green', icon: 'sparkles', label: 'Se emite hoy' },
};

/** «T1·E10» (o «E4» de especiales). */
export const epCode = (season: number, episode: number) => (season === 0 ? `Especial ${episode}` : `T${season}·E${episode}`);

/** URL de la ficha de un episodio. */
export const episodeHref = (seriesId: number | string, season: number, episode: number) => `/serie/${seriesId}/t${season}/e${episode}`;

/** Un episodio de la temporada, lo justo para el progreso (servidor y navegador, D4b-2). */
export interface SeasonEp { e: number; aired: boolean }

/**
 * La línea de progreso bajo «Visto»: barra (0-1) y textos. Mismo cálculo al pintar la página y al
 * marcar o desmarcar sin recargar.
 *   «Temporada 1 completa · 10 de 10» · «Vas por el E13 · 13 de 16 en la T5» · «Al día · 4 de 4
 *   emitidos en la T38» (si este aún no se ha emitido), y «· 18 de 73 en total».
 */
export function progressLine(o: {
    season: number;
    current: number;
    seasonEps: SeasonEp[];
    watched: Set<number>;
    seriesWatched: number;
    seriesTotal: number;
}): { pct: number; text: string; total: string } {
    const where = o.season === 0 ? 'en los especiales' : `en la T${o.season}`;
    const n = o.seasonEps.length;
    const count = o.seasonEps.filter((x) => o.watched.has(x.e)).length;
    const cur = o.seasonEps.find((x) => x.e === o.current);
    const total = o.season > 0 && o.seriesTotal > 0 ? `· ${o.seriesWatched.toLocaleString('es-ES')} de ${o.seriesTotal.toLocaleString('es-ES')} en total` : '';

    if (cur && !cur.aired) {
        const aired = o.seasonEps.filter((x) => x.aired);
        const seenAired = aired.filter((x) => o.watched.has(x.e)).length;
        const lead = aired.length && seenAired === aired.length ? 'Al día · ' : '';
        return { pct: aired.length ? seenAired / aired.length : 0, text: `${lead}${seenAired} de ${aired.length} emitidos ${where}`, total };
    }
    if (n && count === n) {
        return { pct: 1, text: `${o.season === 0 ? 'Especiales completos' : `Temporada ${o.season} completa`} · ${n} de ${n}`, total };
    }
    const max = Math.max(0, ...o.seasonEps.filter((x) => o.watched.has(x.e)).map((x) => x.e));
    const lead = max > 0 && !o.watched.has(o.current) ? `Vas por el E${max} · ` : '';
    return { pct: n ? count / n : 0, text: `${lead}${count} de ${n} ${where}`, total };
}

/** Los anteriores a este en la temporada, ya emitidos y sin ver («Tienes 2 anteriores sin ver · Marcarlos»). */
export const earlierUnseen = (current: number, seasonEps: SeasonEp[], watched: Set<number>) =>
    seasonEps.filter((x) => x.e < current && x.aired && !watched.has(x.e)).map((x) => x.e);

/** «Domingo 19 jun 2011» (columna «Este episodio»). */
export function mediumDate(key: string): string {
    const p = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .formatToParts(at(key));
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${capital(v('weekday'))} ${v('day')} ${v('month').replace('.', '')} ${v('year')}`;
}

/** «hace 15 años» · «hace 3 meses» · «hace 2 días» · «hoy» · «en 4 días». */
export function relativeAgo(key: string, today = todayKey()): string {
    const d = daysBetween(key, today);
    if (d === 0) return 'hoy';
    if (d < 0) return d === -1 ? 'mañana' : `en ${-d} días`;
    if (d === 1) return 'ayer';
    if (d < 30) return `hace ${d} días`;
    const months = Math.floor(d / 30.44);
    if (months < 12) return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
    const years = Math.floor(d / 365.25);
    return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

/**
 * El equipo de un episodio (`crew` de TMDB). Dirección y guion con la misma regla que el acordeón
 * de la ficha de serie (`episodeCredits`); más fotografía, montaje y música si están.
 */
export function episodeCrew(crew: any[] | undefined): Record<'directors' | 'writers' | 'photo' | 'editing' | 'music', string[]> {
    const list = crew ?? [];
    const names = (jobs: string[]) => [...new Set(list.filter((c) => jobs.includes(c?.job)).map((c) => String(c.name)))];
    return {
        directors: names(['Director']),
        writers: names(['Writer', 'Teleplay', 'Screenplay']),
        photo: names(['Director of Photography']),
        editing: names(['Editor']),
        music: names(['Original Music Composer', 'Music', 'Composer']),
    };
}

/** Tipo de episodio en palabras (columna «Este episodio»). */
export function episodeKind(season: number, episodeType: string | null | undefined): string {
    if (season === 0) return 'Especial';
    if (episodeType === 'finale') return 'Final de temporada';
    if (episodeType === 'mid_season') return 'Parón de mitad de temporada';
    return 'Episodio';
}

/** Tipo de oferta de una plataforma, en palabras. */
export const PROVIDER_KIND: Record<string, string> = {
    flatrate: 'Suscripción', free: 'Gratis', ads: 'Gratis con anuncios', rent: 'Alquiler', buy: 'Compra',
};
