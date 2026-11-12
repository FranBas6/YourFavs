/**
 * Ficha de temporada: la barra «Tu temporada» (handoff, punto 2). Pura y sin Astro: la pinta el servidor
 * (`set:html`) y la repinta el navegador (`scripts/serie/season.ts`) al marcar o desmarcar, con el MISMO
 * código, para que nunca digan cosas distintas.
 *
 * Estados: sin sesión · anunciada · sin empezar · a medias («Te toca») · al día de una en emisión · vista.
 * Todo lo que viene de TMDB se escapa (`esc`): los nombres de episodio acaban dentro de HTML.
 */
import { appDateParts } from './appTime';
import { daysBetween, episodeHref, phraseDate, runtimeLabel, seasonHref, shortDate, tinyDate, type SeasonStatus } from './episodeView';

/** Un episodio de la temporada, lo justo para la barra (y, en el paso 3, para la lista). */
export interface TpEp {
    e: number;
    name: string;
    aired: boolean;
    air: string | null;
    runtime: number | null;
    /** URL del fotograma ya resuelta en el servidor (el navegador no importa el cliente de TMDB). */
    still: string | null;
}

export interface TpState {
    seriesId: number;
    season: number;
    logged: boolean;
    status: SeasonStatus | null;
    eps: TpEp[];
    /** Episodio → instante en que lo marcaste ('' si no hay hora). */
    watched: Record<number, string>;
    seriesWatched: number;
    seriesTotal: number;
    /** La temporada siguiente, para «Seguir con la temporada 3». */
    nextSeason: number | null;
    notif: boolean;
    hideStills: boolean;
    today: string;
}

const SVG = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
/** Lucide, copiados de `@iconify-json/lucide` (el resto de la página usa astro-icon). */
const I = {
    check: SVG('<path d="M20 6L9 17l-5-5"/>'),
    checkCheck: SVG('<path d="M18 6L7 17l-5-5m20-2l-7.5 7.5L13 16"/>'),
    eye: SVG('<path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: SVG('<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696a10.8 10.8 0 0 1-1.444 2.49m-6.41-.679a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 4.446-5.143M2 2l20 20"/>'),
    undo: SVG('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
    loader: SVG('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'),
    bell: SVG('<path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>'),
    play: SVG('<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>'),
    login: SVG('<path d="m10 17l5-5l-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>'),
    arrow: SVG('<path d="M5 12h14m-7-7l7 7l-7 7"/>'),
    clock: SVG('<path d="M16 14v2.2l1.6 1M16 2v4m5 1.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M3 10h5m0-8v4"/><circle cx="16" cy="16" r="6"/>'),
    listChecks: SVG('<path d="M13 5h8m-8 7h8m-8 7h8M3 17l2 2l4-4M3 7l2 2l4-4"/>'),
};

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`;
const sumMin = (eps: TpEp[]) => eps.reduce((n, x) => n + (x.runtime && x.runtime > 0 ? x.runtime : 0), 0);
/** «lun 2 nov» (o «lun 2 nov 2019» si no es de este año), para dentro de una frase. */
const brief = (key: string, today: string) =>
    (key.slice(0, 4) === today.slice(0, 4) ? tinyDate(key) : shortDate(key)).replace(/^\S+/, (w) => w.toLowerCase());
/** Día de Madrid de un instante guardado. */
const dayOf = (iso: string) => appDateParts(new Date(iso).getTime()).key;

/** Las cuentas de la temporada para el usuario (también las usa la lista de episodios). */
export function seasonCounts(s: TpState) {
    const seen = (x: TpEp) => x.e in s.watched;
    const aired = s.eps.filter((x) => x.aired);
    const seenEps = s.eps.filter(seen);
    const remaining = aired.filter((x) => !seen(x));
    const days = seenEps.map((x) => s.watched[x.e]).filter(Boolean).map(dayOf).sort();
    return {
        total: s.eps.length,
        aired,
        seenCount: seenEps.length,
        seenAired: aired.length - remaining.length,
        remaining,
        /** El primer emitido sin ver de ESTA temporada (aunque vayas más adelante en la serie, duda 6). */
        next: remaining[0] ?? null,
        firstDay: days[0] ?? null,
        lastDay: days.at(-1) ?? null,
        nextUnaired: s.eps.find((x) => !x.aired) ?? null,
    };
}

/** Un segmento por episodio: visto, te toca (contorno), sin emitir (discontinuo). Nunca solo color: va con texto al lado. */
function segments(s: TpState, nextE: number | null): string {
    return `<span class="tseg" aria-hidden="true">${s.eps.map((x) => `<i class="${x.e in s.watched ? 'w' : x.e === nextE ? 'nx' : !x.aired ? 'u' : ''}"></i>`).join('')}</span>`;
}

/** Botón de la temporada entera (`data-tp-all`): marcar lo emitido o, si está vista, desmarcarla. */
function allButton(on: boolean, label: string, specials: boolean): string {
    return `<button type="button" class="evb" aria-pressed="${on}" data-tp-all>`
        + `<span class="evb-off">${I.eye}${esc(label)}</span>`
        + `<span class="evb-on">${I.checkCheck}${specials ? 'Especiales vistos' : 'Temporada vista'}</span>`
        + `<span class="evb-un">${I.undo}${specials ? 'Desmarcar los especiales' : 'Desmarcar temporada'}</span>`
        + `<span class="evb-busy">${I.loader}Guardando…</span></button>`;
}

function bellButton(on: boolean): string {
    return `<button type="button" class="evb bell" aria-pressed="${on}" data-tp-bell>${I.bell}<span>${on ? 'Aviso de estreno activado' : 'Avisarme del estreno'}</span></button>`;
}

/** «Te toca · E6 Attila» con su «Visto» (`data-tp-ep`). */
function nextCard(s: TpState, x: TpEp): string {
    const href = episodeHref(s.seriesId, s.season, x.e);
    const name = esc(x.name);
    const thumb = x.still && !s.hideStills
        ? `<a class="th" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(x.still)}" alt="" loading="lazy" /></a>`
        : `<a class="th hid" href="${href}" tabindex="-1" aria-hidden="true">${x.still ? I.eyeOff : ''}</a>`;
    const meta = [runtimeLabel(x.runtime), x.air ? shortDate(x.air).replace(/^\S+ /, '') : null].filter(Boolean).join(' · ');
    return `<div class="tnx" role="group" aria-label="Te toca el E${x.e}: ${name}">${thumb}`
        + `<a class="tx" href="${href}"><span class="k">${I.play}Te toca · E${x.e}</span><b>${name}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</a>`
        + `<button type="button" class="tvb" aria-pressed="false" data-tp-ep="${x.e}" aria-label="Marcar el E${x.e} como visto">${I.eye}<span>Visto</span></button></div>`;
}

/**
 * La barra en tres trozos, cada uno para su hueco: `main` (la acción principal), `state` (lo que llevas)
 * y `rest` (el «Marcar los N que quedan» que va con los botones de compartir).
 */
export function seasonBar(s: TpState): { main: string; state: string; rest: string } {
    const c = seasonCounts(s);
    const totalTime = runtimeLabel(sumMin(s.eps));

    if (!s.logged) {
        return {
            main: `<button type="button" class="evb guest" data-tp-auth>${I.login}&nbsp;Entrar</button>`,
            state: `<div class="est"><b class="mu">${I.eyeOff}Entra para marcar lo que ves</b>`
                + `<div class="eprog"><span>${esc([plural(c.total, 'episodio', 'episodios'), totalTime].filter(Boolean).join(' · '))}</span></div></div>`,
            rest: '',
        };
    }

    // Anunciada: nada que marcar todavía; la acción es el aviso de estreno.
    if (!c.aired.length) {
        return {
            main: bellButton(s.notif),
            state: `<div class="est">${s.notif
                ? `<b>${I.bell}Te avisaremos el día del estreno</b><div class="eprog"><span>En la campana y en tu calendario</span></div>`
                : `<b class="mu">${I.clock}Aún no se ha estrenado</b><div class="eprog"><span>Activa el aviso y te lo diremos el día del estreno</span></div>`}</div>`,
            rest: '',
        };
    }

    // Todo lo emitido, visto.
    if (!c.remaining.length) {
        const n = c.total;
        if (c.aired.length < n) {
            // En emisión y al día: la acción vuelve a ser el aviso del próximo.
            const nx = c.nextUnaired;
            return {
                main: bellButton(s.notif),
                state: `<div class="est"><b>${I.check}Al día · ${c.seenAired} de ${c.aired.length} emitidos</b>`
                    + `<div class="eprog">${segments(s, null)}<span>${esc(nx?.air ? `Próximo: E${nx.e}, el ${phraseDate(nx.air, s.today)}` : `Quedan ${plural(n - c.aired.length, 'episodio', 'episodios')} por emitir`)}</span></div></div>`,
                rest: '',
            };
        }
        let head = `${n} de ${n}`;
        let line = '';
        if (c.firstDay && c.lastDay && c.firstDay !== c.lastDay) {
            head += ` · Terminada el ${phraseDate(c.lastDay)}`;
            const span = daysBetween(c.firstDay, c.lastDay) + 1;
            line = `La empezaste el ${phraseDate(c.firstDay, c.lastDay)}: en ${plural(span, 'día', 'días')}`;
        } else if (c.lastDay) {
            head += ` · Marcada como vista el ${phraseDate(c.lastDay)}`;
        } else {
            head += ` · ${s.season === 0 ? 'Especiales vistos' : 'Temporada vista'}`;
        }
        const link = s.nextSeason != null
            ? `<div class="eprog"><a class="nx" href="${seasonHref(s.seriesId, s.nextSeason)}">Seguir con la temporada ${s.nextSeason}${I.arrow}</a></div>`
            : '';
        return {
            main: allButton(true, '', s.season === 0),
            state: `<div class="est"><b>${I.check}${esc(head)}</b>${line ? `<div class="eprog"><span>${esc(line)}</span></div>` : ''}${link}</div>`,
            rest: '',
        };
    }

    // Sin empezar: marcarla entera (solo lo emitido) o empezar por el E1.
    if (!c.seenCount) {
        const label = c.aired.length < c.total ? `Marcar los ${c.aired.length} emitidos`
            : s.season === 0 ? 'Marcar los especiales como vistos' : 'Marcar temporada como vista';
        const first = c.aired[0];
        return {
            main: allButton(false, label, s.season === 0),
            state: `<div class="est"><b class="mu">${I.eyeOff}${esc(['Sin empezar', plural(c.total, 'episodio', 'episodios'), totalTime].filter(Boolean).join(' · '))}</b>`
                + `<div class="eprog"><a class="nx" href="${episodeHref(s.seriesId, s.season, first.e)}">Empezar por el E${first.e} · ${esc(first.name)}${I.arrow}</a></div></div>`,
            rest: '',
        };
    }

    // A medias: «Te toca» manda.
    const left = c.remaining.length;
    const leftTime = runtimeLabel(sumMin(c.remaining));
    const head = c.aired.length < c.total
        ? `${c.seenAired} de ${c.aired.length} emitidos · te quedan ${left}${leftTime ? `, ${leftTime}` : ''}`
        : `${c.seenCount} de ${c.total} · te quedan ${plural(left, 'episodio', 'episodios')}${leftTime ? `, ${leftTime}` : ''}`;
    const sub = [
        c.firstDay ? `Empezada el ${brief(c.firstDay, s.today)}` : '',
        s.season > 0 && s.seriesTotal > 0 ? `${s.seriesWatched.toLocaleString('es-ES')} de ${s.seriesTotal.toLocaleString('es-ES')} en la serie` : '',
    ].filter(Boolean).join(' · ');
    return {
        main: nextCard(s, c.next!),
        state: `<div class="est"><b>${I.check}${esc(head)}</b><div class="eprog">${segments(s, c.next!.e)}${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`,
        rest: left > 1
            ? `<button type="button" class="pf-btn sm ghost" data-tp-rest>${I.listChecks}<span class="d">Marcar los ${left} que quedan</span><span class="m">Marcar todo</span></button>`
            : '',
    };
}

/** La pastilla de una temporada en la tira y su texto de progreso (navegación). */
export function seasonChip(o: { logged: boolean; seen: number; count: number; air: string | null; today: string }) {
    const announced = !o.count || !o.air || o.air > o.today;
    const done = o.logged && o.count > 0 && o.seen >= o.count;
    const small = announced
        ? o.air ? new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${o.air}T12:00:00Z`)).replace('.', '') : 'Pronto'
        : o.logged ? `${Math.min(o.seen, o.count)}/${o.count}` : `${o.count} ep.`;
    return { announced, done, small, pct: o.logged && !done && o.seen > 0 && o.count ? Math.round((o.seen / o.count) * 100) : null };
}

/** El estado de la temporada anterior o siguiente en su tarjeta: «Vista · 9 de 9», «Vas por el E6»… */
export function seasonCardStatus(o: { logged: boolean; seen: number; count: number; air: string | null; today: string; firstUnseen: number | null }): { text: string; done: boolean } {
    if (!o.count || !o.air || o.air > o.today) return { text: o.air ? `Anunciada · ${brief(o.air, o.today)}` : 'Anunciada', done: false };
    if (!o.logged) return { text: plural(o.count, 'episodio', 'episodios'), done: false };
    if (o.seen >= o.count) return { text: `Vista · ${o.count} de ${o.count}`, done: true };
    if (o.seen > 0) return { text: o.firstUnseen ? `Vas por el E${o.firstUnseen}` : `${o.seen} de ${o.count}`, done: false };
    return { text: `Sin empezar · ${plural(o.count, 'episodio', 'episodios')}`, done: false };
}
