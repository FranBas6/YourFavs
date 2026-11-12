/**
 * Ficha de temporada: la lista de episodios (paso 3 del plan).
 *
 *   · «Visto» de cada fila → pide a `season.ts` que marque o desmarque (`yf:season-mark`); la barra,
 *     la tira y esta lista se repintan cuando `season.ts` avisa con `yf:season-watched`.
 *   · Filtro «Todos · Sin ver», sin recargar.
 *   · Con fotogramas o compacta: por defecto compacta desde 16 episodios; la que elijas se recuerda en
 *     este navegador (`localStorage`, sin pasar nada si no se puede).
 *   · «Mostrar los N episodios» de una temporada anunciada larga.
 *   · Sin spoilers: «Mostrar todo» destapa lo oculto de la lista y de la gráfica, solo en esta visita
 *     (no cambia el ajuste); la tarjeta de la gráfica con todo oculto, solo la gráfica.
 */
import { revealSpoiler } from '../shared/spoil';
import { seasonCounts, seenLabel, type TpState } from '../../utils/seasonView';

const DENSITY_KEY = 'yf-season-density';
const raw = document.getElementById('tp-data')?.textContent;
const list = document.querySelector<HTMLElement>('[data-tp-list]');
if (raw && list) init(JSON.parse(raw) as TpState, list);

function init(s: TpState, list: HTMLElement) {
    const rowsBox = list.querySelector<HTMLElement>('[data-tp-rows]')!;
    const rows = [...rowsBox.querySelectorAll<HTMLElement>('[data-tp-row]')];
    const filterBox = list.querySelector<HTMLElement>('[data-tp-filter]');
    const empty = list.querySelector<HTMLElement>('[data-tp-empty]');
    let filter: 'all' | 'unseen' = 'all';

    // --- Densidad ----------------------------------------------------------------------------------
    const densityBox = list.querySelector<HTMLElement>('[data-tp-density]')!;
    const setDensity = (d: 'img' | 'cmp', save: boolean) => {
        rowsBox.classList.toggle('cmp', d === 'cmp');
        densityBox.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.d === d)));
        if (save) try { localStorage.setItem(DENSITY_KEY, d); } catch { /* sin almacenamiento: solo esta visita */ }
    };
    try {
        const saved = localStorage.getItem(DENSITY_KEY);
        if (saved === 'img' || saved === 'cmp') setDensity(saved, false);
    } catch { /* idem */ }
    densityBox.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-d]');
        if (b) setDensity(b.dataset.d as 'img' | 'cmp', true);
    });

    // --- Filtro ------------------------------------------------------------------------------------
    function applyFilter() {
        let shown = 0;
        for (const r of rows) {
            const hide = filter === 'unseen' && (r.classList.contains('w') || r.classList.contains('u'));
            r.hidden = hide;
            if (!hide) shown++;
        }
        if (empty) empty.hidden = !(filter === 'unseen' && shown === 0);
        // Con el filtro puesto se ve todo lo que queda, aunque la lista estuviera plegada.
        if (filter === 'unseen') rowsBox.classList.remove('folded');
    }
    filterBox?.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-f]');
        if (!b) return;
        filter = b.dataset.f as 'all' | 'unseen';
        filterBox.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        applyFilter();
    });

    // Llegando con `#e5` (desde la ficha del episodio): si esa fila estaba plegada, se despliega.
    const target = /^#e\d+$/.test(location.hash) ? rowsBox.querySelector<HTMLElement>(location.hash) : null;
    if (target?.classList.contains('xtra')) { rowsBox.classList.remove('folded'); target.scrollIntoView(); }

    // --- «Mostrar los N episodios» -----------------------------------------------------------------
    const more = list.querySelector<HTMLButtonElement>('[data-tp-more]');
    more?.addEventListener('click', () => {
        rowsBox.classList.remove('folded');
        more.closest('.tl-more')?.remove();
    });

    // --- Sin spoilers: «Mostrar todo» y «Mostrar» de la gráfica ---------------------------------------
    /** Destapa la nota de una barra (la guarda en `data-v` / `data-h`, fuera del texto accesible). */
    const revealBar = (bar: HTMLElement) => {
        if (!bar.classList.contains('hid') || !bar.dataset.v) return;
        bar.classList.remove('hid');
        bar.querySelector<HTMLElement>('.v')!.textContent = bar.dataset.v;
        bar.querySelector<HTMLElement>('.bar')!.style.height = `${bar.dataset.h}px`;
    };
    function revealChart() {
        document.querySelectorAll<HTMLElement>('[data-tp-bar].hid').forEach(revealBar);
        document.querySelector('[data-tp-chart-hide]')?.remove();
        document.querySelector('[data-tp-chart]')?.removeAttribute('hidden');
        document.querySelector('[data-tp-hidden-n]')?.remove();
    }
    function revealRow(r: HTMLElement) {
        r.querySelectorAll<HTMLElement>('.yf-spoil:not(.revealed)').forEach(revealSpoiler);
        r.querySelector<HTMLElement>('[data-tp-r]')?.removeAttribute('hidden');
        r.querySelector<HTMLElement>('[data-tp-rh]')?.setAttribute('hidden', '');
    }
    list.querySelector('[data-tp-reveal-all]')?.addEventListener('click', () => {
        rows.forEach(revealRow);
        revealChart();
        list.querySelector('[data-tp-hidden]')?.remove();
        rowsBox.querySelector<HTMLElement>('.tr .t')?.focus();
    });
    document.querySelector('[data-tp-chart-show]')?.addEventListener('click', () => {
        revealChart();
        document.querySelector<HTMLElement>('[data-tp-chart]')?.focus();
    });

    // --- «Visto» de cada fila ----------------------------------------------------------------------
    rowsBox.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tp-row-btn]');
        if (!b) return;
        const row = b.closest<HTMLElement>('[data-tp-row]')!;
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.classList.add('busy');
        document.dispatchEvent(new CustomEvent('yf:season-mark', { detail: { episode: Number(row.dataset.tpRow), on, btn: b } }));
    });

    // --- Al día con lo que diga `season.ts` --------------------------------------------------------
    document.addEventListener('yf:season-watched', ((ev: CustomEvent<{ watched: Record<number, string> }>) => {
        s.watched = ev.detail.watched;
        const c = seasonCounts(s);
        const nextE = c.seenCount ? c.next?.e ?? null : null;
        for (const r of rows) {
            const e = Number(r.dataset.tpRow);
            const seen = e in s.watched;
            r.classList.toggle('w', seen);
            r.classList.toggle('nx', e === nextE);
            const btn = r.querySelector<HTMLButtonElement>('[data-tp-row-btn]');
            if (btn) {
                btn.classList.remove('busy');
                btn.setAttribute('aria-pressed', String(seen));
                btn.setAttribute('aria-label', seen ? `E${e} visto. Pulsa para desmarcar` : `Marcar el E${e} como visto`);
            }
            const tag = r.querySelector<HTMLElement>('[data-tp-seen]');
            if (tag) {
                tag.hidden = !seen;
                const t = tag.querySelector('span');
                if (t) t.textContent = seen ? seenLabel(s.watched[e], s.today) : '';
            }
            // Visto: lo oculto por spoilers ya no lo es (fotograma, sinopsis y nota).
            if (seen) revealRow(r);
        }
        // La gráfica de notas: pleno = visto, apagado = sin ver; la de «Te toca», con contorno.
        document.querySelectorAll<HTMLElement>('[data-tp-bar]').forEach((bar) => {
            const e = Number(bar.dataset.tpBar);
            const seen = e in s.watched;
            bar.classList.toggle('nw', !seen);
            bar.classList.toggle('cur', e === nextE);
            if (seen && !bar.querySelector('.dot')) bar.querySelector('.bar')?.insertAdjacentHTML('afterend', '<span class="dot"></span>');
            if (!seen) bar.querySelector('.dot')?.remove();
            // Sin spoilers: al verlo, su nota se destapa.
            if (seen) revealBar(bar);
        });
        const unseen = list.querySelector<HTMLElement>('[data-tp-unseen]');
        if (unseen) unseen.textContent = String(c.remaining.length);
        // El filtro solo tiene sentido si hay vistos y sin ver a la vez (o si está puesto).
        if (filterBox) filterBox.hidden = filter === 'all' && (!c.remaining.length || c.remaining.length === c.aired.length);
        applyFilter();
    }) as EventListener);

    // Un fallo al guardar: el botón de la fila deja de girar (el error lo enseña la barra).
    document.addEventListener('yf:season-error', () => rows.forEach((r) => r.querySelector('[data-tp-row-btn]')?.classList.remove('busy')));
}
