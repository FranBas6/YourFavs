/**
 * Ordenar Ver pronto a mano (2026-11-18). Cada sección (Series, Películas) tiene su botón «Ordenar»: la
 * rejilla de pósters se cambia por una lista compacta donde se arrastra por el asa ⠿ (ratón, dedo con
 * pulsación mantenida o ↑/↓ con el teclado, el motor de `scripts/ui/reorder.ts`) o se usan los botones
 * ↑ · ↓ · «Al principio». Cada movimiento se guarda solo (`POST /api/lists/order`); «Hecho» vuelve a la
 * rejilla, ya colocada en el orden nuevo, sin recargar.
 *
 * El orden se guarda en la base de datos, así que es el mismo en cualquier navegador, en el móvil y en el
 * Brief diario de la portada (que mira primero Ver pronto, en este orden).
 */
import { initReorder } from '../ui/reorder';

for (const section of document.querySelectorAll<HTMLElement>('[data-vpo-section]')) setup(section);

function setup(section: HTMLElement) {
    const toggle = section.querySelector<HTMLButtonElement>('[data-vpo-toggle]');
    const grid = section.querySelector<HTMLElement>('[data-vpo-grid]');
    const list = section.querySelector<HTMLElement>('[data-vpo-order]');
    const status = section.querySelector<HTMLElement>('[data-vpo-status]');
    const live = section.querySelector<HTMLElement>('[data-vpo-live]');
    if (!toggle || !grid || !list) return;
    const collection = list.dataset.vpoOrder || '';
    const rows = () => Array.from(list.querySelectorAll<HTMLElement>('.vpo-row'));
    const titleOf = (row: HTMLElement) => row.dataset.title || '';

    /** Número de puesto y flechas que no llevan a ningún sitio, desactivadas. */
    function renumber() {
        const all = rows();
        all.forEach((row, i) => {
            const idx = row.querySelector<HTMLElement>('[data-vpo-index]');
            if (idx) idx.textContent = String(i + 1);
            for (const b of row.querySelectorAll<HTMLButtonElement>('[data-vpo-move]')) {
                const dir = b.dataset.vpoMove;
                b.disabled = dir === 'down' ? i === all.length - 1 : i === 0;
            }
        });
    }

    function setStatus(text: string, bad = false) {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle('is-bad', bad);
    }

    function announce(row: HTMLElement) {
        if (live) live.textContent = `${titleOf(row)}: puesto ${rows().indexOf(row) + 1} de ${rows().length}`;
    }

    // Guardar: el último movimiento manda. Si llega tarde la respuesta de uno anterior, no pisa el estado.
    let seq = 0;
    async function save() {
        const mine = ++seq;
        setStatus('Guardando…');
        try {
            const res = await fetch('/api/lists/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection, ids: rows().map((r) => Number(r.dataset.id)) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) throw new Error(data?.error || String(res.status));
            if (mine === seq) setStatus('Guardado');
        } catch {
            if (mine === seq) setStatus('No se ha podido guardar. Vuelve a moverlo para reintentar.', true);
        }
    }

    const { flip } = initReorder(list, {
        rowSelector: '.vpo-row',
        handleSelector: '.vpo-handle',
        onCommit: () => { renumber(); void save(); },
        onKeyMove: announce,
    });

    // ↑ · ↓ · «Al principio»
    list.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-vpo-move]');
        if (!btn || btn.disabled) return;
        const row = btn.closest<HTMLElement>('.vpo-row');
        if (!row) return;
        const all = rows();
        const i = all.indexOf(row);
        const dir = btn.dataset.vpoMove;
        flip(() => {
            if (dir === 'up' && i > 0) list.insertBefore(row, all[i - 1]);
            else if (dir === 'down' && i < all.length - 1) list.insertBefore(row, all[i + 1].nextSibling);
            else if (dir === 'top' && i > 0) list.insertBefore(row, all[0]);
        });
        renumber();
        void save();
        announce(row);
        // Si el botón pulsado se ha quedado desactivado (llegó arriba o abajo), el foco al asa.
        if (btn.disabled) row.querySelector<HTMLElement>('.vpo-handle')?.focus();
        else btn.focus();
    });

    /** La rejilla, en el orden de la lista (los pósters son los mismos nodos, sin recargar). */
    function syncGrid() {
        const cards = new Map<string, HTMLElement>();
        for (const c of Array.from(grid!.children) as HTMLElement[]) if (c.dataset.id) cards.set(c.dataset.id, c);
        for (const row of rows()) {
            const card = cards.get(row.dataset.id || '');
            if (card) grid!.appendChild(card);
        }
    }

    toggle.addEventListener('click', () => {
        const opening = !section.classList.contains('is-ordering');
        if (!opening) syncGrid();
        section.classList.toggle('is-ordering', opening);
        toggle.textContent = opening ? 'Hecho' : 'Ordenar';
        toggle.setAttribute('aria-expanded', String(opening));
        setStatus('');
        if (opening) rows()[0]?.querySelector<HTMLElement>('.vpo-handle')?.focus();
    });

    renumber();
    toggle.classList.add('is-ready'); // sin JavaScript no se enseña: el modo ordenar lo necesita
}
