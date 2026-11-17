/**
 * Motor de «reordenar arrastrando» de Ajustes, compartido por la lista de la portada
 * (`home-reorder.ts`) y las secciones del perfil público (`publico.ts`, F6 social).
 *
 * POINTER EVENTS, no HTML5 drag & drop. `public/js/reorder.js` (el de las colecciones) usa
 * `dragstart`, que **no se dispara con el dedo**: en móvil ese reordenado simplemente no existe.
 * Pointer Events cubre ratón, dedo y lápiz con el mismo código.
 *
 * Reordenación EN VIVO: la fila se coloca de verdad en su hueco mientras arrastras y las vecinas se
 * recolocan animadas con FLIP (medir → mover en el DOM → animar desde la posición vieja). Lo que ves
 * durante el gesto es exactamente el resultado.
 *
 * Lo propio de cada lista entra por ganchos: `onCross` cuando la fila pasa por encima de algo que
 * NO es otra fila (el separador «Ocultos» de la portada), `onCommit` al terminar un movimiento (ahí
 * cada lista guarda) y `onKeyMove` tras mover con el teclado (para anunciarlo).
 */
export interface ReorderOptions {
    /** Las filas que se mueven. */
    rowSelector: string;
    /** Todo lo que cuenta como hueco: las filas y, si los hay, separadores. Por defecto, las filas. */
    itemSelector?: string;
    /** El asa (un `<button>`, para que ↑/↓ funcionen con el teclado). */
    handleSelector: string;
    onCross?: (row: HTMLElement, other: HTMLElement, goingUp: boolean) => void;
    onCommit: (row: HTMLElement) => void;
    onKeyMove?: (row: HTMLElement) => void;
}

const LONG_PRESS_MS = 150;   // en táctil, hasta aquí el gesto sigue siendo un scroll
const MOVE_TOLERANCE = 8;    // px que se perdonan antes de decidir que es scroll y no arrastre

/** Engancha el arrastre a `list`. Devuelve `flip` para que la lista anime sus propios cambios. */
export function initReorder(list: HTMLElement, opts: ReorderOptions) {
    const itemSel = opts.itemSelector ?? opts.rowSelector;
    const rows = () => Array.from(list.querySelectorAll<HTMLElement>(opts.rowSelector));
    const items = () => Array.from(list.querySelectorAll<HTMLElement>(itemSel));

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

        if (commit) opts.onCommit(row);
    }

    list.addEventListener('pointerdown', (e) => {
        const handle = (e.target as HTMLElement).closest<HTMLElement>(opts.handleSelector);
        if (!handle || e.button !== 0) return;
        const row = handle.closest<HTMLElement>(opts.rowSelector);
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

        for (const other of items()) {
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

            if (!other.matches(opts.rowSelector)) opts.onCross?.(row, other, goingUp);
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
        const handle = (e.target as HTMLElement).closest<HTMLElement>(opts.handleSelector);
        if (!handle) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const row = handle.closest<HTMLElement>(opts.rowSelector);
        if (!row) return;
        e.preventDefault();

        const all = items();
        const i = all.indexOf(row);
        const target = e.key === 'ArrowUp' ? all[i - 1] : all[i + 1];
        if (!target) return;

        flip(() => {
            if (e.key === 'ArrowUp') list.insertBefore(row, target);
            else list.insertBefore(row, target.nextSibling);
        });

        if (!target.matches(opts.rowSelector)) opts.onCross?.(row, target, e.key === 'ArrowUp');
        opts.onCommit(row);
        opts.onKeyMove?.(row);
        handle.focus();   // el DOM se ha movido; no perder el foco
    });

    return { flip };
}
