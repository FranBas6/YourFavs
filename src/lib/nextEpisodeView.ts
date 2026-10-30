/**
 * «Estás viendo» / «Continuar viendo»: el marcado de sus tarjetas (handoff
 * `docs/design_handoff_estas_viendo`). Funciones PURAS que devuelven HTML: las usa el servidor
 * (`NextEpisode.astro`, con `set:html`) y el navegador al rehacer una tarjeta tras «Marcar visto»
 * (`scripts/home/nextEpisode.ts`). Antes había tres copias a mano del mismo marcado; ahora sale
 * siempre de aquí.
 *
 * Dos destinos y nunca mezclados: el póster y el nombre de la serie llevan a la serie; el fotograma,
 * el título del episodio y la flecha, al episodio (`/serie/{id}/t{n}/e{m}`). Sin sinopsis (es lo
 * más «spoiler» del episodio y está a un toque, en su ficha). Los estilos, en
 * `styles/components/next-episode.css`. Todo lo que viene de TMDB pasa por `esc()`.
 */
import { esc, icon } from './social/ui';
import type { NextEpisodeItem } from '../services/API/Series/nextEpisode';
import type { ViendoMovie } from '../services/API/Movies/viendoMovies';
import { decimal, episodeHref, isPlaceholderTitle, todayKey } from '../utils/episodeView';

const IMG = 'https://image.tmdb.org/t/p';
const img = (path: string, size: string) => `${IMG}/${size}${path}`;

/** «23 ene 2007», o «Hoy» si se emitió hoy (fechas de TMDB: solo el día). */
function airLabel(d: string | null): string {
    if (!d) return '';
    if (d === todayKey()) return 'Hoy';
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${d}T12:00:00Z`)).replace('.', '');
}

/** «T1 · E17» (o «Especial 4»). */
const seLabel = (s: number, e: number) => (s === 0 ? `Especial ${e}` : `T${s} · E${e}`);
const seShort = (s: number, e: number) => (s === 0 ? `especial ${e}` : `T${s}·E${e}`);

/** Etiqueta FINAL / PARÓN, como la de la ficha de episodio (sin spoiler: dice dónde acaba la temporada). */
function tag(episodeType: string | null | undefined): string {
    if (episodeType === 'finale') return `<span class="etag" style="--sb:var(--stamp-amber);--si:var(--stamp-amber-ink)">${icon('flag')}Final</span>`;
    if (episodeType === 'mid_season') return `<span class="etag" style="--sb:var(--stamp-slate);--si:var(--stamp-slate-ink)">${icon('pause')}Parón</span>`;
    return '';
}

/** Póster 2:3 de la serie o de la película (o su hueco). */
function poster(path: string | null, cls: string, href: string, label: string, small: boolean, extra = ''): string {
    const pic = path
        ? `<img src="${img(path, small ? 'w92' : 'w185')}" srcset="${img(path, small ? 'w185' : 'w342')} 2x" alt="" loading="lazy" />`
        : `<span class="nv-ph" aria-hidden="true">${icon('tv')}</span>`;
    return `<a class="${cls}" href="${href}" aria-label="${esc(label)}">${pic}${extra}</a>`;
}

export interface SerieCardOptions {
    /** Ocultar el fotograma (modo sin spoilers con «ocultar fotogramas»). */
    hideStill?: boolean;
    /** Recién marcado: «T1·E17 visto · Deshacer» encima (`code` es el que se marcó). */
    just?: { season: number; episode: number } | null;
    /** Imágenes con carga diferida (las tarjetas que quedan fuera de la vista). */
    lazy?: boolean;
}

/** Lo que el navegador necesita para marcar y rehacer la tarjeta. */
function serieData(it: NextEpisodeItem, hideStill: boolean): string {
    return `data-nv-serie="${it.id}" data-season="${it.next_season}" data-episode="${it.next_episode}" data-name="${esc(it.name)}" data-poster="${esc(it.poster_path ?? '')}"${hideStill ? ' data-hide-still' : ''}`;
}

/** Tarjeta de serie: el siguiente episodio que te toca. */
export function serieCard(it: NextEpisodeItem, o: SerieCardOptions = {}): string {
    const s = it.next_season, e = it.next_episode;
    const epHref = episodeHref(it.id, s, e);
    const serieHref = `/serie/${it.id}`;
    const title = isPlaceholderTitle(it.next_episode_name, e) ? `Episodio ${e}` : it.next_episode_name;
    const epLabel = `Episodio ${seShort(s, e)}: ${title}`;
    const chips = `<span class="se">${seLabel(s, e)}</span>${tag(it.episode_type)}`;

    let media: string;
    if (!it.still_path) {
        media = `<a class="nv-m none" href="${epHref}" aria-label="${esc(epLabel)}">${chips}${icon('image-off')}Sin fotograma</a>`;
    } else {
        const still = `<img src="${img(it.still_path, 'w300')}" srcset="${img(it.still_path, 'w500')} 2x" alt=""${o.lazy ? ' loading="lazy"' : ''} />`;
        media = o.hideStill
            ? `<div class="nv-m nv-sp yf-spoil">`
                + `<a class="yf-blur" href="${epHref}" aria-label="${esc(epLabel)}" aria-hidden="true" inert>${still}</a>`
                + `<span class="nv-chips">${chips}</span>`
                + `<button type="button" class="yf-spoil-btn">${icon('eye')}Mostrar fotograma</button></div>`
            : `<a class="nv-m" href="${epHref}" aria-label="${esc(epLabel)}">${still}<span class="nv-chips">${chips}</span></a>`;
    }

    const pct = it.total_count ? Math.min(100, Math.round((it.watched_count / it.total_count) * 100)) : 0;
    const progress = it.total_count
        ? `<div class="nv-pr"><span class="bar" role="progressbar" aria-label="Progreso en ${esc(it.name)}" aria-valuenow="${it.watched_count}" aria-valuemin="0" aria-valuemax="${it.total_count}"><i style="width:${Math.max(pct, 3)}%"></i></span><b>${it.watched_count} de ${it.total_count}</b></div>`
        : '';
    const when = airLabel(it.air_date);
    const meta = [
        when ? `<span>${icon('calendar')}${when}</span>` : '',
        it.vote_average != null && it.vote_average > 0 ? `<span class="nv-rt">${icon('star')}<b>${decimal(it.vote_average)}</b>&nbsp;TMDB</span>` : '',
    ].join('');
    const just = o.just
        ? `<div class="nv-just" role="status">${icon('check')}<span>${seShort(o.just.season, o.just.episode)} visto</span><button type="button" data-nv-undo="${o.just.season}:${o.just.episode}">${icon('undo-2')}Deshacer</button></div>`
        : '';

    return `<article class="nv" ${serieData(it, !!o.hideStill)} aria-label="${esc(it.name)}, siguiente episodio ${seLabel(s, e)}">`
        + just + media
        + `<div class="nv-b">`
        + poster(it.poster_path, 'nv-po', serieHref, `Ficha de ${it.name}`, true)
        + `<div class="nv-sr"><a href="${serieHref}" aria-label="Ficha de ${esc(it.name)}">${esc(it.name)}</a></div>`
        + `<a class="nv-t" href="${epHref}" aria-label="${esc(epLabel)}">${esc(title)}</a>`
        + (meta ? `<div class="nv-mt">${meta}</div>` : '')
        + progress
        + `<div class="nv-a">`
        + `<button type="button" class="nv-mk" data-nv-mark aria-pressed="false" aria-label="Marcar visto ${seShort(s, e)} de ${esc(it.name)}">${icon('check')}<span>Marcar visto</span></button>`
        + `<a class="nv-go ico" href="${epHref}" aria-label="${esc(epLabel)}" title="Ver episodio">${icon('arrow-right')}</a>`
        + `</div></div></article>`;
}

/** Al día: no quedan episodios emitidos sin ver. Mismo tamaño que la tarjeta. */
export function doneCard(serie: { id: number | string; name: string; poster_path: string | null }): string {
    const href = `/serie/${serie.id}`;
    return `<article class="nv" data-nv-serie="${serie.id}" aria-label="${esc(serie.name)}, al día"><div class="nv-done" role="status">`
        + poster(serie.poster_path, 'pp', href, `Ficha de ${serie.name}`, false, `<span class="nv-ck">${icon('check')}</span>`)
        + `<b>Al día con ${esc(serie.name)}</b>`
        + `<p>Has visto todo lo emitido. Te avisaremos en la campana cuando salga el siguiente.</p>`
        + `<a class="nv-go" href="${href}" data-nv-focus>Ver la serie${icon('chevron-right')}</a>`
        + `</div></article>`;
}

function runtimeLabel(min: number | null): string {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
}

/** Tarjeta de película en «Viendo». */
export function movieCard(mv: ViendoMovie): string {
    const href = `/movie/${mv.id}`;
    const started = mv.started_at
        ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(mv.started_at)).replace('.', '')
        : '';
    const facts = ['Película', mv.year, runtimeLabel(mv.runtime)].filter(Boolean).join(' · ');
    return `<article class="nv nv-movie" data-nv-movie="${esc(mv.id)}" data-name="${esc(mv.title)}" data-poster="${esc(mv.poster_path ?? '')}" aria-label="${esc(mv.title)}, película en Viendo">`
        + `<div class="nv-pm">`
        + poster(mv.poster_path, 'pp', href, `Ficha de ${mv.title}`, false)
        + `<div class="nv-pm-t"><span class="k">${icon('play')}Viendo</span>`
        + `<a class="nv-t" href="${href}" aria-label="Ficha de ${esc(mv.title)}">${esc(mv.title)}</a>`
        + `<div class="nv-mt"><span>${esc(facts)}</span>`
        + (mv.vote_average != null && mv.vote_average > 0 ? `<span class="nv-rt">${icon('star')}<b>${decimal(mv.vote_average)}</b>&nbsp;TMDB</span>` : '')
        + (started ? `<span class="ok">${icon('clock')}Empezada el ${started}</span>` : '')
        + `</div></div></div>`
        + `<div class="nv-b"><div class="nv-a">`
        + `<button type="button" class="nv-mk" data-nv-finish aria-label="Terminar ${esc(mv.title)}">${icon('check-check')}<span>Terminar</span></button>`
        + `<a class="nv-go" href="${href}" aria-label="Ficha de ${esc(mv.title)}">Ficha${icon('chevron-right')}</a>`
        + `</div></div></article>`;
}

/** Película terminada: ya está en Vistas. */
export function movieDoneCard(mv: { id: string; title: string; poster_path: string | null }): string {
    const href = `/movie/${mv.id}`;
    return `<article class="nv nv-movie" data-nv-movie="${esc(mv.id)}" aria-label="${esc(mv.title)}, terminada"><div class="nv-done" role="status">`
        + poster(mv.poster_path, 'pp', href, `Ficha de ${mv.title}`, false, `<span class="nv-ck">${icon('check')}</span>`)
        + `<b>Terminada · ${esc(mv.title)}</b>`
        + `<p>Está en tus Vistas.</p>`
        + `<a class="nv-go" href="${href}" data-nv-focus>Ver ficha${icon('chevron-right')}</a>`
        + `</div></article>`;
}
