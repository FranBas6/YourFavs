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

// --- Ficha de temporada (`/serie/{id}/t{n}`) ------------------------------------------------------

/** URL de la ficha de una temporada. */
export const seasonHref = (seriesId: number | string, season: number) => `/serie/${seriesId}/t${season}`;

/** «Temporada 2» o «Especiales». */
export const seasonLabel = (season: number) => (season === 0 ? 'Especiales' : `Temporada ${season}`);

/**
 * ¿El nombre de TMDB es el genérico («Temporada 2», «Season 2», «Especiales»)? Si no lo es
 * (*Murder House*, «Libro primero»), la cabecera lo usa de título.
 */
export function isPlaceholderSeasonName(name: string | null | undefined, season: number, seriesName = ''): boolean {
    const n = (name ?? '').trim();
    if (!n) return true;
    // «Stranger Things 4»: el nombre de la serie y el número no son un nombre propio.
    if (seriesName && n.toLowerCase() === `${seriesName.trim().toLowerCase()} ${season}`) return true;
    if (season === 0) return /^(especiales|specials|spéciaux|extras)$/i.test(n);
    // Miniseries: TMDB llama «Miniserie» o «Limited Series» a su única temporada.
    if (/^(miniserie|miniseries|mini-series|limited series|serie limitada|temporada única)$/i.test(n)) return true;
    return new RegExp(`^(temporada|season|saison|staffel|stagione|temporada n\\.?º?)\\s*${season}$`, 'i').test(n);
}

export type SeasonStatus = 'airing' | 'announced' | 'last';

/**
 * Estado de la temporada para la etiqueta de la cabecera:
 *   · `announced` — ningún episodio emitido (o TMDB aún no lista ninguno);
 *   · `airing` — unos emitidos y otros no, o TMDB dice que el próximo episodio de la serie es de esta;
 *   · `last` — la serie terminó y esta es su última temporada;
 *   · `null` — una temporada cerrada cualquiera (y los especiales, siempre).
 */
export function seasonStatus(o: {
    season: number;
    airStates: AirState[];
    seriesEnded: boolean;
    isLastSeason: boolean;
    nextAirSeason: number | null;
}): SeasonStatus | null {
    if (o.season === 0) return null;
    const aired = o.airStates.filter((a) => a !== 'soon').length;
    if (aired === 0) return 'announced';
    if (aired < o.airStates.length || o.nextAirSeason === o.season) return 'airing';
    if (o.seriesEnded && o.isLastSeason) return 'last';
    return null;
}

export const SEASON_STATUS_STYLE: Record<SeasonStatus, { color: string; icon: string; label: string }> = {
    airing: { color: 'green', icon: 'radio', label: 'En emisión' },
    announced: { color: 'blue', icon: 'calendar-clock', label: 'Anunciada' },
    last: { color: 'amber', icon: 'flag', label: 'Última temporada' },
};

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const weekdayOf = (key: string) => at(key).getUTCDay();

/** «viernes 21 jun 2019» (en minúscula, para ir dentro de una frase); sin el año si es el de `today`. */
export function phraseDate(key: string, today?: string): string {
    const s = shortDate(key).replace(/^\S+/, WEEKDAYS[weekdayOf(key)]);
    return today && key.slice(0, 4) === today.slice(0, 4) ? s.replace(/ \d{4}$/, '') : s;
}

/** «6 semanas» · «4 meses» · «2 años» (la duración de un parón). */
function spanLabel(days: number): string {
    if (days < 63) return `${Math.round(days / 7)} semanas`;
    if (days < 730) return `${Math.round(days / 30.44)} meses`;
    return `${Math.round(days / 365.25)} años`;
}

/** «17 ene – 21 mar 2025» · «28 sept 2025 – 17 may 2026» · «21 jun 2019» (un solo día). */
export function dateRange(first: string, last: string): string {
    const d = (k: string, year: boolean) => {
        const s = shortDate(k).replace(/^\S+ /, '');
        return year ? s : s.replace(/ \d{4}$/, '');
    };
    if (first === last) return d(first, true);
    return `${d(first, first.slice(0, 4) !== last.slice(0, 4))} – ${d(last, true)}`;
}

/** Más de tres semanas sin episodio cuenta como parón (handoff, punto 1). */
const BREAK_DAYS = 21;

/**
 * Cómo se emitió la temporada, a partir de las fechas de sus episodios. Es la línea que sustituye a la
 * sinopsis cuando TMDB no la tiene (lo normal), así que nunca sale «No hay descripción»:
 *   «Los 8 episodios se estrenaron a la vez el viernes 21 jun 2019»
 *   «Uno cada viernes, del 17 ene al 21 mar 2025» · «Estreno con 3 episodios y luego uno cada jueves…»
 *   «… con un parón de 6 semanas» · «Uno al día, del 1 al 5 dic 2024» · «Del 3 mar al 12 jun 2008»
 * Con `regular = false` (los especiales) solo se dice el rango de fechas.
 * `null` si no hay fechas emitidas (la temporada anunciada lleva la cuenta atrás en su lugar).
 */
export function seasonSchedule(airDates: (string | null)[], today = todayKey(), regular = true): string | null {
    const dates = airDates.filter((x): x is string => !!x && x <= today).sort();
    if (!dates.length) return null;
    const n = dates.length;
    const first = dates[0], last = dates[n - 1];
    const allAired = dates.length === airDates.length;
    if (n === 1) return `Se estrenó el ${phraseDate(first)}`;
    if (first === last) return allAired ? `Los ${n} episodios se estrenaron a la vez el ${phraseDate(first)}` : `Los ${n} primeros se estrenaron a la vez el ${phraseDate(first)}`;

    const days = [...new Set(dates)];
    const gaps = days.slice(1).map((k, i) => daysBetween(days[i], k));
    const breaks = gaps.filter((g) => g > BREAK_DAYS);
    const usual = gaps.filter((g) => g <= BREAK_DAYS);
    const share = (ok: (g: number) => boolean) => (usual.length ? usual.filter(ok).length / usual.length : 0);
    const batch = dates.filter((k) => k === first).length;
    const range = dateRange(first, last).replace(/^/, 'del ').replace(' – ', ' al ');

    let rhythm: string;
    // Con tantos parones como pausas normales (los especiales, casi siempre) no hay ritmo que contar.
    // `regular = false` en los especiales: se emiten sueltos, aunque dos caigan seguidos.
    if (!regular || breaks.length >= usual.length) {
        rhythm = '';
    } else if (share((g) => g >= 6 && g <= 8) >= 0.7) {
        // Días de la semana de los episodios fuera del estreno: si casi todos caen el mismo, se nombra.
        const wd = days.slice(batch > 1 ? 1 : 0).map(weekdayOf);
        const counts = wd.reduce<Record<number, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
        const [top, c] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ['0', 0];
        rhythm = c / wd.length >= 0.7 ? `uno cada ${WEEKDAYS[Number(top)]}` : 'uno a la semana';
    } else if (share((g) => g === 1) >= 0.7) {
        rhythm = 'uno al día';
    } else {
        rhythm = '';
    }

    if (!rhythm) return capital(range);
    let text = batch > 1 ? `Estreno con ${batch} episodios y luego ${rhythm}, ${range}` : `${capital(rhythm)}, ${range}`;
    if (breaks.length === 1) text += `, con un parón de ${spanLabel(breaks[0])}`;
    else if (breaks.length > 1) text += `, con ${breaks.length} parones`;
    return text;
}
