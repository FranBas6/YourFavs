/**
 * «Estás viendo» / «Continuar viendo» (`components/Sections/NextEpisode.astro`) sin recargar.
 *
 *   · Flechas ‹ ›: desplazan 4 tarjetas; se desactivan en los extremos.
 *   · «Marcar visto»: `POST /api/episodes/watched` y `GET /api/series/{id}/next-episode`. La tarjeta
 *     se rehace con el siguiente episodio y una franja «T1·E17 visto · Deshacer» (6 s); el foco va
 *     al «Marcar visto» nuevo y se anuncia. Si no quedan emitidos, «al día» (foco a «Ver la serie»).
 *     «Deshacer» desmarca (`action: 'unmark'`) y vuelve a pintar ese episodio.
 *   · «Terminar» (películas): `POST /api/movies/finish` → «Terminada».
 *   · Invitado: guarda la intención y pide entrar; tras entrar (la página recarga) se repite sola.
 * El marcado sale de `lib/nextEpisodeView.ts`, el mismo que pinta el servidor.
 */
import '../shared/spoil';
import { showToast } from '../social/toast';
import { doneCard, movieDoneCard, serieCard } from '../../lib/nextEpisodeView';
import type { NextEpisodeItem } from '../../services/API/Series/nextEpisode';

const JUST_MS = 6000;
const PENDING_KEY = 'yf_pending_fetch';

/** Pinta HTML en lugar de una tarjeta y devuelve la nueva. */
function swap(card: HTMLElement, html: string): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const next = tpl.content.firstElementChild as HTMLElement;
    card.replaceWith(next);
    return next;
}

function setBusy(btn: HTMLButtonElement | null, busy: boolean, label: string) {
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('busy', busy);
    if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    const span = btn.querySelector('span');
    if (span) span.textContent = busy ? 'Guardando…' : label;
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = busy
        ? '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 1 1-6.219-8.56"/>'
        : svg.dataset.orig ?? svg.innerHTML;
}

async function postWatched(serieId: string, season: number, episode: number, unmark = false): Promise<void> {
    const r = await fetch('/api/episodes/watched', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serieId, season, episode, ...(unmark ? { action: 'unmark' } : {}) }),
    });
    if (r.status === 401) {
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind: 'episode-watched', serieId, season, episode })); } catch { /* sin storage */ }
        document.dispatchEvent(new CustomEvent('yf:require-auth'));
        throw new Error('auth');
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(String(r.status));
}

async function nextEpisode(serieId: string): Promise<NextEpisodeItem | null> {
    const r = await fetch(`/api/series/${serieId}/next-episode`);
    const j = await r.json().catch(() => null);
    return j?.next ?? null;
}

document.querySelectorAll<HTMLElement>('[data-nep]').forEach((root) => {
    const row = root.querySelector<HTMLElement>('[data-nv-row]')!;
    const live = root.querySelector<HTMLElement>('[data-nv-live]');
    const prev = root.querySelector<HTMLButtonElement>('[data-nv-prev]');
    const next = root.querySelector<HTMLButtonElement>('[data-nv-next]');
    const announce = (msg: string) => { if (!live) return; live.textContent = ''; window.setTimeout(() => { live.textContent = msg; }, 50); };

    // ---- Flechas -----------------------------------------------------------------------------
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = () => {
        const card = row.querySelector<HTMLElement>('.nv');
        const gap = parseFloat(getComputedStyle(row).columnGap) || 16;
        return card ? 4 * (card.offsetWidth + gap) : row.clientWidth;
    };
    const arrows = () => {
        const max = row.scrollWidth - row.clientWidth;
        if (prev) prev.disabled = row.scrollLeft <= 2;
        if (next) next.disabled = row.scrollLeft >= max - 2;
    };
    prev?.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }));
    next?.addEventListener('click', () => row.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }));
    row.addEventListener('scroll', arrows, { passive: true });
    window.addEventListener('resize', arrows);
    arrows();

    // ---- Series: marcar, deshacer, al día -------------------------------------------------------
    const justTimers = new WeakMap<HTMLElement, number>();

    function serieFrom(card: HTMLElement) {
        return {
            id: card.dataset.nvSerie!,
            name: card.dataset.name ?? '',
            poster_path: card.dataset.poster || null,
            hideStill: card.hasAttribute('data-hide-still'),
        };
    }

    /** Rehace la tarjeta con lo que toque ahora; `just` = el episodio recién marcado. */
    async function repaint(card: HTMLElement, just: { season: number; episode: number } | null): Promise<HTMLElement> {
        const s = serieFrom(card);
        const it = await nextEpisode(s.id);
        if (!it) {
            const done = swap(card, doneCard({ id: s.id, name: s.name, poster_path: s.poster_path }));
            done.querySelector<HTMLElement>('[data-nv-focus]')?.focus();
            announce(just ? `T${just.season}·E${just.episode} marcado. Al día con ${s.name}.` : `Al día con ${s.name}.`);
            return done;
        }
        const fresh = swap(card, serieCard(it, { just, hideStill: s.hideStill }));
        fresh.querySelector<HTMLElement>('[data-nv-mark]')?.focus({ preventScroll: true });
        if (just) {
            const t = window.setTimeout(() => fresh.querySelector('.nv-just')?.remove(), JUST_MS);
            justTimers.set(fresh, t);
            announce(`T${just.season}·E${just.episode} marcado. Siguiente: T${it.next_season}·E${it.next_episode}, ${it.next_episode_name}.`);
        }
        return fresh;
    }

    async function mark(card: HTMLElement) {
        if (card.dataset.busy) return;
        const btn = card.querySelector<HTMLButtonElement>('[data-nv-mark]');
        const season = Number(card.dataset.season), episode = Number(card.dataset.episode);
        card.dataset.busy = '1';
        if (btn) btn.querySelector('svg')!.dataset.orig = btn.querySelector('svg')!.innerHTML;
        setBusy(btn, true, 'Marcar visto');
        try {
            await postWatched(card.dataset.nvSerie!, season, episode);
            await repaint(card, { season, episode });
        } catch (err) {
            setBusy(btn, false, 'Marcar visto');
            delete card.dataset.busy;
            if ((err as Error).message !== 'auth') showToast('No se ha podido guardar', 'error');
        }
    }

    async function undo(card: HTMLElement, code: string) {
        const [season, episode] = code.split(':').map(Number);
        window.clearTimeout(justTimers.get(card));
        try {
            await postWatched(card.dataset.nvSerie!, season, episode, true);
            await repaint(card, null);
            announce(`T${season}·E${episode} desmarcado.`);
        } catch (err) {
            if ((err as Error).message !== 'auth') showToast('No se ha podido deshacer', 'error');
        }
    }

    // ---- Películas: terminar -----------------------------------------------------------------
    async function finish(card: HTMLElement) {
        if (card.dataset.busy) return;
        const btn = card.querySelector<HTMLButtonElement>('[data-nv-finish]');
        card.dataset.busy = '1';
        if (btn) btn.querySelector('svg')!.dataset.orig = btn.querySelector('svg')!.innerHTML;
        setBusy(btn, true, 'Terminar');
        try {
            const r = await fetch('/api/movies/finish', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tmdb_id: Number(card.dataset.nvMovie) }),
            });
            if (r.status === 401) { document.dispatchEvent(new CustomEvent('yf:require-auth')); throw new Error('auth'); }
            const j = await r.json().catch(() => null);
            if (!r.ok || !j?.ok) throw new Error(String(r.status));
            const title = card.dataset.name ?? '';
            const done = swap(card, movieDoneCard({ id: card.dataset.nvMovie!, title, poster_path: card.dataset.poster || null }));
            done.querySelector<HTMLElement>('[data-nv-focus]')?.focus();
            announce(`${title}, terminada. Está en tus Vistas.`);
        } catch (err) {
            setBusy(btn, false, 'Terminar');
            delete card.dataset.busy;
            if ((err as Error).message !== 'auth') showToast('No se ha podido guardar', 'error');
        }
    }

    row.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const card = t.closest<HTMLElement>('.nv');
        if (!card) return;
        if (t.closest('[data-nv-mark]')) { void mark(card); return; }
        const u = t.closest<HTMLElement>('[data-nv-undo]');
        if (u) { void undo(card, u.dataset.nvUndo!); return; }
        if (t.closest('[data-nv-finish]')) void finish(card);
    });

    // ---- Repetir tras entrar --------------------------------------------------------------------
    // Un invitado que pulsó «Marcar visto»: se guardó la intención y se abrió el modal. Al entrar la
    // página recarga; si queda una intención y su tarjeta está, se repite sin segundo clic.
    if (document.cookie.split('; ').some((c) => c.startsWith('has_session='))) {
        let intent: any = null;
        try { intent = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null'); sessionStorage.removeItem(PENDING_KEY); } catch { /* nada */ }
        if (intent?.kind === 'episode-watched') {
            const card = row.querySelector<HTMLElement>(`.nv[data-nv-serie="${intent.serieId}"]`);
            if (card && Number(card.dataset.season) === Number(intent.season) && Number(card.dataset.episode) === Number(intent.episode)) void mark(card);
        }
    }
});
