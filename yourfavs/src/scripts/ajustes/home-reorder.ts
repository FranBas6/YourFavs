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
 */
export {};   // hace del fichero un módulo: sin esto su `init` choca con el de autosave.ts

const LONG_PRESS_MS = 150;   // en táctil, hasta aquí el gesto sigue siendo un scroll
const MOVE_TOLERANCE = 8;    // px que se perdonan antes de decidir que es scroll y no arrastre

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

    // ---- FLIP: mover en el DOM sin que las vecinas salten -------------------
    /**
     * Ejecuta `mutate()` y anima a todas las filas desde donde estaban. `exclude` es la fila
     * arrastrada, que sigue al dedo y no debe llevar transición.
     */
    function flip(mutate: () => void, exclude?: HTMLElement | null) {
        const before = new Map<HTMLElement, number>();
        for (const r of rows()) before.set(r, r.getBoundingClientRect().top);

        mutate();

        for (const r of rows()) {
            if (r === exclude) continue;
            const from = before.get(r);
            if (from === undefined) continue;
            const delta = from - r.getBoundingClientRect().top;
            if (!delta) continue;
            r.classList.remove('is-shifting');
            r.style.transform = `translateY(${delta}px)`;
            // Dos frames: uno para que el navegador acepte la posición de partida, otro para animar.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                r.classList.add('is-shifting');
                r.style.transform = '';
            }));
        }
    }

    // ---- Arrastre ----------------------------------------------------------
    let drag: {
        row: HTMLElement;
        pointerId: number;
        startY: number;
        /** Corrección acumulada: cada reordenación cambia la posición de reposo de la fila. */
        correction: number;
        started: boolean;
        timer: number;
    } | null = null;

    function moveTo(y: number) {
        if (!drag) return;
        drag.row.style.transform = `translateY(${y - drag.startY + drag.correction}px) rotate(-.5deg) scale(1.012)`;
    }

    function beginDrag() {
        if (!drag) return;
        drag.started = true;
        drag.row.classList.add('is-dragging');
        drag.row.classList.remove('is-shifting');
        document.body.style.userSelect = 'none';
    }

    function endDrag(commit: boolean) {
        if (!drag) return;
        const { row, started } = drag;
        window.clearTimeout(drag.timer);
        drag = null;
        document.body.style.userSelect = '';
        if (!started) return;

        row.classList.remove('is-dragging');
        // Volver al hueco animado: la fila ya está en su sitio del DOM, solo hay que
        // deshacer el transform del gesto.
        row.classList.add('is-shifting');
        row.style.transform = '';
        window.setTimeout(() => row.classList.remove('is-shifting'), 180);

        if (commit) save();
    }

    list.addEventListener('pointerdown', (e) => {
        const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-home-handle]');
        if (!handle || e.button !== 0) return;
        const row = handle.closest<HTMLElement>('.aj-home-row');
        if (!row) return;

        handle.setPointerCapture(e.pointerId);
        drag = { row, pointerId: e.pointerId, startY: e.clientY, correction: 0, started: false, timer: 0 };

        if (e.pointerType === 'touch') {
            // Pulsación mantenida: hasta los 150 ms el dedo puede estar haciendo scroll.
            drag.timer = window.setTimeout(beginDrag, LONG_PRESS_MS);
        } else {
            beginDrag();
        }
    });

    list.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;

        if (!drag.started) {
            // Se movió antes de que venciera la pulsación → era un scroll, no un arrastre.
            if (Math.abs(e.clientY - drag.startY) > MOVE_TOLERANCE) { endDrag(false); }
            return;
        }
        e.preventDefault();
        moveTo(e.clientY);

        // ¿Sobre qué elemento está el centro de la fila arrastrada?
        const rect = drag.row.getBoundingClientRect();
        const center = rect.top + rect.height / 2;

        const items = Array.from(list.querySelectorAll<HTMLElement>('.aj-home-row, .aj-home-sep'));
        for (const other of items) {
            if (other === drag.row) continue;
            const r = other.getBoundingClientRect();
            // Solo se cruza cuando se pasa del centro del vecino: evita el temblor cuando dos
            // elementos se intercambian y vuelven a intercambiarse en el mismo píxel.
            const otherCenter = r.top + r.height / 2;
            const pos = drag.row.compareDocumentPosition(other);
            const goingUp = center < otherCenter && Boolean(pos & Node.DOCUMENT_POSITION_PRECEDING);
            const goingDown = center > otherCenter && Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING);
            if (!goingUp && !goingDown) continue;

            const row = drag.row;
            const beforeTop = row.getBoundingClientRect().top;
            flip(() => {
                if (goingUp) list.insertBefore(row, other);
                else list.insertBefore(row, other.nextSibling);
            }, row);
            // La fila cambió de sitio en el flujo: hay que compensar para que no dé un salto
            // bajo el dedo.
            drag.correction += beforeTop - row.getBoundingClientRect().top;
            moveTo(e.clientY);

            // Cruzar el separador enciende o apaga: se toca el checkbox, que es la fuente
            // de verdad, y así el interruptor y el arrastre no pueden discrepar.
            if (other.hasAttribute('data-home-sep')) {
                const sw = switchOf(row);
                if (sw) sw.checked = goingUp;
                refresh();
            }
            break;
        }
    }, { passive: false });

    list.addEventListener('pointerup', (e) => {
        if (drag && e.pointerId === drag.pointerId) endDrag(true);
    });
    list.addEventListener('pointercancel', (e) => {
        if (drag && e.pointerId === drag.pointerId) endDrag(true);
    });

    // ---- Teclado: el asa es un <button>, así que ↑/↓ mueven la fila ---------
    list.addEventListener('keydown', (e) => {
        const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-home-handle]');
        if (!handle) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const row = handle.closest<HTMLElement>('.aj-home-row');
        if (!row) return;
        e.preventDefault();

        const items = Array.from(list.querySelectorAll<HTMLElement>('.aj-home-row, .aj-home-sep'));
        const i = items.indexOf(row);
        const target = e.key === 'ArrowUp' ? items[i - 1] : items[i + 1];
        if (!target) return;

        flip(() => {
            if (e.key === 'ArrowUp') list.insertBefore(row, target);
            else list.insertBefore(row, target.nextSibling);
        });

        // Si lo que se ha saltado es el separador, además cambia de estado.
        if (target.hasAttribute('data-home-sep')) {
            const sw = switchOf(row);
            if (sw) sw.checked = e.key === 'ArrowUp';
        }
        save();
        announce(row);
        handle.focus();   // el DOM se ha movido; no perder el foco
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
