/**
 * Ficha de episodio (TMDB D4b-2): la barra de acciones sin recargar.
 *
 *   · «Visto»: `POST /api/episodes/watched` (marcar o `action: 'unmark'`). Cambia el botón
 *     (`aria-pressed`), la línea de estado y el progreso, el cuadro de la tira y destapa los spoilers.
 *     Toast con «Deshacer» y aviso en la región `aria-live`. Si falla, vuelve como estaba.
 *   · Al marcar, ofrece el siguiente («Siguiente: E8 · … →» o «Empezar la temporada 2 →»); no
 *     navega solo.
 *   · «Tienes N anteriores sin ver · Marcarlos»: los marca de una vez (`episodes: […]`).
 *   · Sin emitir: «Avisarme del estreno» (`POST /api/notifications/subscribe`).
 * Los textos del progreso salen de `utils/episodeView.ts::progressLine`, lo mismo que en el servidor.
 */
import { showToast } from '../social/toast';
import { revealSpoiler } from '../shared/spoil';
import { earlierUnseen, progressLine, watchedLabel, type SeasonEp } from '../../utils/episodeView';

interface Data {
    seriesId: number;
    season: number;
    episode: number;
    logged: boolean;
    seasonEps: SeasonEp[];
    watched: number[];
    seriesWatched: number;
    seriesTotal: number;
    next: { href: string; code: string; name: string; season: number; episode: number } | null;
}

// Iconos de Lucide que se pintan desde aquí (el resto vienen del servidor).
const SVG = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
    check: SVG('<path d="M20 6 9 17l-5-5"/>'),
    eyeOff: SVG('<path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M17.5 17.5A10.4 10.4 0 0 1 12 19c-7 0-10-7-10-7a13 13 0 0 1 5.5-5.5"/><path d="m2 2 20 20"/>'),
    arrow: SVG('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const raw = document.getElementById('ep-data')?.textContent;
if (raw) init(JSON.parse(raw) as Data);

function init(d: Data) {
    const bar = document.querySelector<HTMLElement>('[data-ep-bar]')!;
    const btn = bar.querySelector<HTMLButtonElement>('[data-ep-watch]');
    const bell = bar.querySelector<HTMLButtonElement>('[data-ep-bell]');
    const state = bar.querySelector<HTMLElement>('[data-ep-state]')!;
    const err = bar.querySelector<HTMLElement>('[data-ep-err]')!;
    const live = bar.querySelector<HTMLElement>('[data-ep-live]')!;
    const watched = new Set(d.watched);
    let seriesWatched = d.seriesWatched;
    let busy = false;

    const requireAuth = () => document.dispatchEvent(new CustomEvent('yf:require-auth'));
    const announce = (msg: string) => { live.textContent = ''; window.setTimeout(() => { live.textContent = msg; }, 50); };

    async function post(body: Record<string, unknown>): Promise<any> {
        const r = await fetch('/api/episodes/watched', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serieId: String(d.seriesId), season: d.season, ...body }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(String(r.status));
        return j;
    }

    /** La línea de estado y el progreso. `just`: recién marcado (ofrece el siguiente). */
    function renderState(opts: { seenAt?: string | null; just?: boolean } = {}) {
        const seen = watched.has(d.episode);
        const p = progressLine({ season: d.season, current: d.episode, seasonEps: d.seasonEps, watched, seriesWatched, seriesTotal: d.seriesTotal });
        const seasonDone = p.pct === 1;
        let head: string;
        let extra = '';
        if (seen && opts.just) {
            head = `<b>${ICON.check}Visto ahora${seasonDone && d.season > 0 ? ` · Temporada ${d.season} completa` : ''}</b>`;
            if (d.next) {
                const crosses = d.next.season !== d.season;
                const label = crosses ? `Empezar la temporada ${d.next.season}` : `Siguiente: E${d.next.episode} · ${esc(d.next.name)}`;
                extra = `<div class="eprog"><a class="nx" href="${d.next.href}">${label}${ICON.arrow}</a>${crosses ? `<span class="t">${esc(d.next.code)} · ${esc(d.next.name)}</span>` : ''}</div>`;
            }
        } else if (seen) {
            head = `<b>${ICON.check}${opts.seenAt ? `Lo viste el ${watchedLabel(opts.seenAt)}` : 'Lo has visto'}</b>`;
        } else {
            head = `<b class="mu">${ICON.eyeOff}Aún no lo has visto</b>`;
        }
        const progress = `<div class="eprog"><span class="bar" aria-hidden="true"><i style="width:${Math.round(p.pct * 100)}%"></i></span><span>${esc(p.text)}</span>${p.total ? `<span class="t">${esc(p.total)}</span>` : ''}</div>`;
        const before = seen ? [] : earlierUnseen(d.episode, d.seasonEps, watched);
        const earlier = before.length
            ? `<button type="button" class="ea-earlier" data-ep-earlier="${before.join(',')}">Tienes ${before.length} ${before.length === 1 ? 'anterior' : 'anteriores'} sin ver · <u>${before.length === 1 ? 'Marcarlo' : 'Marcarlos'}</u></button>`
            : '';
        state.innerHTML = head + (opts.just && extra ? extra : progress) + earlier;
    }

    /** El cuadro de la tira de un episodio. */
    function paintStrip(e: number) {
        const li = document.querySelector<HTMLElement>(`[data-ep-strip] li:nth-child(${d.seasonEps.findIndex((x) => x.e === e) + 1})`);
        if (!li) return;
        const on = watched.has(e);
        li.classList.toggle('w', on);
        const a = li.querySelector('a');
        if (a) a.setAttribute('aria-label', (a.getAttribute('aria-label') ?? '').replace(/, (visto|sin ver)/, on ? ', visto' : ', sin ver'));
    }

    function setWatched(e: number, on: boolean) {
        if (on === watched.has(e)) return;
        if (on) watched.add(e); else watched.delete(e);
        if (d.season > 0) seriesWatched += on ? 1 : -1;
        paintStrip(e);
    }

    async function toggle(to: boolean, undoable = true) {
        if (!btn || busy) return;
        if (!d.logged) return requireAuth();
        busy = true;
        err.hidden = true;
        btn.classList.add('busy');
        btn.setAttribute('aria-busy', 'true');
        const was = watched.has(d.episode);
        try {
            const r = await post(to ? { episode: d.episode } : { episode: d.episode, action: 'unmark' });
            setWatched(d.episode, to);
            btn.setAttribute('aria-pressed', String(to));
            renderState({ just: to, seenAt: r.watchedAt });
            if (to) document.querySelectorAll<HTMLElement>('.yf-spoil:not(.revealed)').forEach(revealSpoiler);
            announce(to ? 'Marcado como visto' : 'Desmarcado');
            if (undoable) showToast(to ? 'Marcado como visto' : 'Desmarcado', 'success', () => { void toggle(!to, false); });
        } catch {
            btn.setAttribute('aria-pressed', String(was));
            err.hidden = false;
        } finally {
            busy = false;
            btn.classList.remove('busy');
            btn.removeAttribute('aria-busy');
        }
    }

    btn?.addEventListener('click', () => {
        btn.classList.add('fresh'); // sin «Desmarcar» hasta que el ratón salga (ver episodio.css)
        void toggle(btn.getAttribute('aria-pressed') !== 'true');
    });
    btn?.addEventListener('mouseleave', () => btn.classList.remove('fresh'));
    btn?.addEventListener('blur', () => btn.classList.remove('fresh'));

    // «Marcarlos»: los anteriores sin ver de la temporada.
    state.addEventListener('click', async (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ep-earlier]');
        if (!b || busy) return;
        const eps = (b.dataset.epEarlier ?? '').split(',').map(Number).filter(Boolean);
        if (!eps.length) return;
        busy = true;
        b.disabled = true;
        try {
            await post({ episodes: eps });
            eps.forEach((x) => setWatched(x, true));
            renderState();
            const msg = `${eps.length} ${eps.length === 1 ? 'episodio marcado' : 'episodios marcados'} como vistos`;
            announce(msg);
            showToast(msg);
        } catch {
            b.disabled = false;
            err.hidden = false;
        } finally {
            busy = false;
        }
    });

    // Sin emitir: el aviso de estreno de la serie.
    bell?.addEventListener('click', async () => {
        if (!d.logged) return requireAuth();
        const on = bell.getAttribute('aria-pressed') !== 'true';
        bell.disabled = true;
        try {
            const r = await fetch('/api/notifications/subscribe', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media_type: 'tv', tmdb_id: d.seriesId, on }),
            });
            if (!r.ok) throw new Error(String(r.status));
            bell.setAttribute('aria-pressed', String(on));
            bell.querySelector('span')!.textContent = on ? 'Aviso de estreno activado' : 'Avisarme del estreno';
            announce(on ? 'Te avisaremos del estreno' : 'Aviso de estreno quitado');
            showToast(on ? 'Te avisaremos cuando se estrene' : 'Ya no te avisaremos del estreno');
        } catch {
            err.hidden = false;
        } finally {
            bell.disabled = false;
        }
    });
}
