/**
 * Reordenar los bloques de la portada arrastrando — handoff `design_handoff_ajustes` (A4).
 *
 * POINTER EVENTS, no HTML5 drag & drop. `public/js/reorder.js` (el de las colecciones) usa
 * `dragstart`, que **no se dispara con el dedo**: en móvil ese reordenado simplemente no existe.
 * Pointer Events cubre ratón, dedo y lápiz con el mismo código.
 *
 * Cómo funciona el arrastre: reordenación EN VIVO. En vez de pintar una línea de caída y mover
 * la fila al soltar, la fila se coloca de verdad en su hueco mientras arrastras y las vecinas se
 * recolocan animadas con FLIP (medir → mover en el DOM → animar desde la posición vieja). Así lo
 * que ves durante el gesto es exactamente el resultado, sin un indicador que hay que interpretar.
 *
 * Cruzar el separador «Ocultos» apaga o enciende el bloque: es la misma operación que su
 * interruptor, y de hecho lo que se hace es marcar/desmarcar ese checkbox, que es quien manda.
 *
 * Guardado: no se toca la red desde aquí. Se emite `yf:home-order` y `autosave.ts` lee el orden
 * del DOM y lo manda — un único sitio que sabe hablar con el servidor.
 *
 * El arrastre en sí (puntero, teclado y FLIP) vive en `reorder.ts`, que comparte con las secciones
 * del perfil público (F6 social); aquí queda lo propio de la portada: el separador, los contadores,
 * el interruptor y «Restablecer orden».
 */
import { initReorder } from './reorder';

const list = document.getElementById('home-layout');
if (list) init(list);

function init(list: HTMLElement) {
    const live = document.getElementById('home-live');

    const rows = () => Array.from(list.querySelectorAll<HTMLElement>('.aj-home-row'));
    const sep = () => list.querySelector<HTMLElement>('[data-home-sep]');
    const switchOf = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]');

    /** El separador flota: siempre justo antes de la primera fila apagada. */
    function placeSeparator() {
        const s = sep();
        if (!s) return;
        const firstOff = rows().find((r) => !switchOf(r)?.checked);
        if (firstOff) list.insertBefore(s, firstOff);
        else list.appendChild(s);
    }

    /** Índices, clase `is-off`, contadores y texto del separador, todo desde el DOM. */
    function refresh() {
        const all = rows();
        let n = 0;
        for (const row of all) {
            const on = Boolean(switchOf(row)?.checked);
            row.classList.toggle('is-off', !on);
            const idx = row.querySelector<HTMLElement>('[data-home-index]');
            if (idx) idx.textContent = on ? String(++n) : '—';
        }
        const visible = document.getElementById('home-visible-count');
        if (visible) visible.textContent = String(n);
        const hidden = list.querySelector<HTMLElement>('[data-hidden-count]');
        if (hidden) hidden.textContent = String(all.length - n);
    }

    function announce(row: HTMLElement) {
        if (!live) return;
        const title = row.querySelector('.aj-home-title')?.textContent?.trim() || 'Bloque';
        const on = Boolean(switchOf(row)?.checked);
        if (!on) { live.textContent = `${title}, oculto`; return; }
        const visibles = rows().filter((r) => switchOf(r)?.checked);
        live.textContent = `${title}, posición ${visibles.indexOf(row) + 1} de ${visibles.length}`;
    }

    function save() {
        placeSeparator();
        refresh();
        document.dispatchEvent(new CustomEvent('yf:home-order'));
    }

    // ---- Arrastre, teclado y FLIP: el motor común (reorder.ts) ----------------
    // Cruzar el separador «Ocultos» enciende o apaga: se toca el checkbox, que es la fuente de
    // verdad, y así el interruptor y el arrastre no pueden discrepar.
    const { flip } = initReorder(list, {
        rowSelector: '.aj-home-row',
        itemSelector: '.aj-home-row, .aj-home-sep',
        handleSelector: '[data-home-handle]',
        onCross: (row, other, goingUp) => {
            if (!other.hasAttribute('data-home-sep')) return;
            const sw = switchOf(row);
            if (sw) sw.checked = goingUp;
            refresh();
        },
        onCommit: () => save(),
        onKeyMove: (row) => announce(row),
    });

    // ---- Interruptor: apagar baja la fila bajo el separador -----------------
    list.addEventListener('change', (e) => {
        if (!(e.target as HTMLElement).closest('.aj-switch')) return;
        const row = (e.target as HTMLElement).closest<HTMLElement>('.aj-home-row');
        flip(() => { if (row) reflow(row); else placeSeparator(); });
        refresh();
        if (row) announce(row);
        // El guardado lo dispara `autosave.ts` con el propio `change`; aquí solo se recoloca.
    });

    /** Recoloca una fila al lado correcto del separador tras cambiar su interruptor. */
    function reflow(row: HTMLElement) {
        const s = sep();
        if (!s) return;
        const on = Boolean(switchOf(row)?.checked);
        if (on) list.insertBefore(row, s);            // encendida → arriba del separador
        else list.appendChild(row);                    // apagada → al final
        placeSeparator();
    }

    // ---- Restablecer orden -------------------------------------------------
    document.getElementById('home-reset')?.addEventListener('click', () => {
        // Orden canónico = el de HOME_SECTIONS, que es el que trae el markup en `data-default`.
        const all = rows();
        const canonical = [...all].sort((a, b) => Number(a.dataset.default || 0) - Number(b.dataset.default || 0));
        flip(() => {
            for (const r of canonical) list.appendChild(r);
            placeSeparator();
        });
        refresh();
        document.dispatchEvent(new CustomEvent('yf:home-order'));
        if (live) live.textContent = 'Orden restablecido';
    });

    refresh();
}
