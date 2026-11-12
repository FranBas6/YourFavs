/**
 * Ficha de temporada: la barra «Tu temporada» sin recargar (paso 2 del plan).
 *
 *   · «Marcar temporada como vista» / «Marcar los N que quedan» → `POST /api/episodes/watched` con
 *     `episodes: […]` (solo los emitidos sin ver). «Deshacer» los desmarca y los saca del diario.
 *   · «Temporada vista» (pulsado) → desmarca la temporada (`action: 'unmark'` + `episodes`). La API
 *     devuelve lo que había con su fecha y «Deshacer» lo devuelve tal cual (`restore`), así que
 *     Actividad no cambia.
 *   · «Visto» de «Te toca» → marca ese episodio; «Deshacer» lo desmarca.
 *   · Aviso de estreno (`POST /api/notifications/subscribe`) y «Entrar» sin sesión.
 * Tras cada cambio se repinta con `utils/seasonView.ts::seasonBar`, el mismo código que usa el servidor.
 * La lista de episodios (`seasonList.ts`) pide marcar con `yf:season-mark` y se repinta con
 * `yf:season-watched`; si algo falla, `yf:season-error`.
 */
import { showToast } from '../social/toast';
import { seasonBar, seasonChip, seasonSide, type TpState } from '../../utils/seasonView';

const raw = document.getElementById('tp-data')?.textContent;
if (raw) init(JSON.parse(raw) as TpState);

function init(s: TpState) {
    const bar = document.querySelector<HTMLElement>('[data-tp-bar]');
    if (!bar) return;
    const slot = (k: string) => bar.querySelector<HTMLElement>(`[data-tp-${k}]`)!;
    const err = slot('err');
    const live = slot('live');
    let busy = false;

    const requireAuth = () => document.dispatchEvent(new CustomEvent('yf:require-auth'));
    const announce = (msg: string) => { live.textContent = ''; window.setTimeout(() => { live.textContent = msg; }, 50); };
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

    /** `fresh`: el clic vino del botón de la temporada; el nuevo no enseña «Desmarcar» hasta que salga el ratón. */
    function render(fresh = false) {
        const b = seasonBar(s);
        slot('main').innerHTML = b.main;
        if (fresh) slot('main').querySelector('[data-tp-all]')?.classList.add('fresh');
        slot('state').innerHTML = b.state;
        slot('rest').innerHTML = b.rest;
        const side = document.querySelector<HTMLElement>('[data-tp-side]');
        if (side) side.innerHTML = seasonSide(s);
        // La pastilla de esta temporada en la tira de navegación.
        const chip = document.querySelector<HTMLElement>('[data-tp-chip]');
        if (chip) {
            const seen = Object.keys(s.watched).length;
            const c = seasonChip({ logged: s.logged, seen, count: s.eps.length, air: s.eps[0]?.air ?? null, today: s.today });
            chip.classList.toggle('w', c.done);
            const small = chip.querySelector('small');
            if (small) small.textContent = c.small;
            chip.querySelector('.pb')?.remove();
            if (c.pct != null) chip.querySelector('a')?.insertAdjacentHTML('beforeend', `<span class="pb"><i style="width:${c.pct}%"></i></span>`);
        }
        document.dispatchEvent(new CustomEvent('yf:season-watched', { detail: { watched: { ...s.watched } } }));
    }

    async function post(body: Record<string, unknown>): Promise<any> {
        const r = await fetch('/api/episodes/watched', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serieId: String(s.seriesId), season: s.season, ...body }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(String(r.status));
        return j;
    }

    /** Aplica a `s` lo que acaba de cambiar (y el contador de la serie, que no cuenta los especiales). */
    function apply(added: Record<number, string>, removed: number[]) {
        for (const [e, at] of Object.entries(added)) {
            if (!(e in s.watched) && s.season > 0) s.seriesWatched++;
            s.watched[Number(e)] = at;
        }
        for (const e of removed) {
            if (e in s.watched && s.season > 0) s.seriesWatched--;
            delete s.watched[e];
        }
    }

    /** Envuelve una acción: bloquea, enseña «Guardando…» en el botón y, si falla, el error. */
    async function run(btn: HTMLElement | null, fn: () => Promise<void>) {
        const fail = () => document.dispatchEvent(new CustomEvent('yf:season-error'));
        if (busy) return fail();
        if (!s.logged) { fail(); return requireAuth(); }
        busy = true;
        err.hidden = true;
        btn?.classList.add('busy');
        btn?.setAttribute('aria-busy', 'true');
        try {
            await fn();
        } catch {
            err.hidden = false;
            btn?.classList.remove('busy');
            btn?.removeAttribute('aria-busy');
            fail();
        } finally {
            busy = false;
        }
    }

    /** Marca estos episodios; el toast deshace (y los saca del diario: era un error). */
    function markMany(eps: number[], btn: HTMLElement | null, undoable = true) {
        return run(btn, async () => {
            await post({ episodes: eps });
            const now = new Date().toISOString();
            apply(Object.fromEntries(eps.map((e) => [e, now])), []);
            render(!!btn?.matches('[data-tp-all]'));
            const msg = eps.length === 1 ? `E${eps[0]} marcado como visto` : `${plural(eps.length, 'episodio marcado', 'episodios marcados')} como vistos`;
            announce(msg);
            if (undoable) showToast(msg, 'success', () => { void unmarkMany(eps, null, { unlog: true, undoable: false }); });
        });
    }

    /** Desmarca; con `unlog: false` el diario se queda y el toast los devuelve con su fecha. */
    function unmarkMany(eps: number[], btn: HTMLElement | null, o: { unlog: boolean; undoable: boolean }) {
        return run(btn, async () => {
            const r = await post({ episodes: eps, action: 'unmark', unlog: o.unlog });
            const removed: { episode: number; watched_at: string | null }[] = r.removed ?? [];
            apply({}, eps);
            render(!!btn?.matches('[data-tp-all]'));
            const msg = !o.undoable ? 'Deshecho'
                : eps.length === 1 ? `E${eps[0]} desmarcado`
                : s.season === 0 ? 'Especiales desmarcados' : 'Temporada desmarcada';
            announce(msg);
            if (o.undoable && removed.length) showToast(msg, 'success', () => { void restore(removed, o.unlog); });
        });
    }

    function restore(rows: { episode: number; watched_at: string | null }[], relog: boolean) {
        return run(null, async () => {
            await post({ restore: rows, relog });
            apply(Object.fromEntries(rows.map((r) => [r.episode, r.watched_at ?? new Date().toISOString()])), []);
            render();
            announce('Deshecho');
        });
    }

    const unseenAired = () => s.eps.filter((x) => x.aired && !(x.e in s.watched)).map((x) => x.e);

    bar.addEventListener('click', (ev) => {
        const t = ev.target as HTMLElement;
        const all = t.closest<HTMLButtonElement>('[data-tp-all]');
        if (all) {
            all.classList.add('fresh');
            if (all.getAttribute('aria-pressed') === 'true') {
                void unmarkMany(Object.keys(s.watched).map(Number), all, { unlog: false, undoable: true });
            } else {
                const eps = unseenAired();
                if (eps.length) void markMany(eps, all);
            }
            return;
        }
        const rest = t.closest<HTMLButtonElement>('[data-tp-rest] button');
        if (rest) { const eps = unseenAired(); if (eps.length) void markMany(eps, rest); return; }
        const one = t.closest<HTMLButtonElement>('[data-tp-ep]');
        if (one) { void markMany([Number(one.dataset.tpEp)], one); return; }
        if (t.closest('[data-tp-auth]')) { requireAuth(); return; }
        const bell = t.closest<HTMLButtonElement>('[data-tp-bell]');
        if (bell) void toggleBell(bell);
    });
    // Recién pulsado, sin «Desmarcar» hasta que el ratón salga (como en la ficha de episodio).
    bar.addEventListener('mouseout', (ev) => {
        const b = (ev.target as HTMLElement).closest?.('[data-tp-all].fresh');
        if (b && !b.contains(ev.relatedTarget as Node)) b.classList.remove('fresh');
    });

    async function toggleBell(bell: HTMLButtonElement) {
        if (!s.logged) return requireAuth();
        const on = bell.getAttribute('aria-pressed') !== 'true';
        bell.disabled = true;
        err.hidden = true;
        try {
            const r = await fetch('/api/notifications/subscribe', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media_type: 'tv', tmdb_id: s.seriesId, on }),
            });
            if (!r.ok) throw new Error(String(r.status));
            s.notif = on;
            render();
            announce(on ? 'Te avisaremos del estreno' : 'Aviso de estreno quitado');
            showToast(on ? 'Te avisaremos cuando se estrene' : 'Ya no te avisaremos del estreno');
        } catch {
            err.hidden = false;
            bell.disabled = false;
        }
    }

    // La lista de episodios pide marcar o desmarcar una fila con `yf:season-mark`.
    document.addEventListener('yf:season-mark', ((ev: CustomEvent<{ episode: number; on: boolean; btn?: HTMLElement }>) => {
        const { episode, on, btn } = ev.detail;
        if (on) void markMany([episode], btn ?? null);
        else void unmarkMany([episode], btn ?? null, { unlog: true, undoable: true });
    }) as EventListener);
}
