/* Reordenado por arrastre (Fase L3b) — HTML5 drag&drop sobre un grid.
 *
 * window.YFReorder(container, selector, onReorder):
 *   - hace draggable cada `selector` dentro de `container` (y su <a> interno NO,
 *     para que el clic siga navegando a la ficha).
 *   - al soltar, llama onReorder(orderedIds) con el nuevo orden (data-id ||
 *     data-item-id). El DOM ya queda reordenado; persistir es cosa de onReorder.
 *   - devuelve { refresh } para re-marcar items añadidos dinámicamente.
 *
 * Heurística de inserción para grid 2D: si el puntero está claramente encima del
 * elemento → antes; debajo → después; misma fila → por la mitad horizontal.
 */
(function () {
    if (typeof window === 'undefined') return;
    window.YFReorder = function (container, selector, onReorder) {
        if (!container) return null;
        var dragEl = null;

        function items() { return Array.prototype.slice.call(container.querySelectorAll(selector)); }
        function order() { return items().map(function (el) { return el.getAttribute('data-id') || el.getAttribute('data-item-id'); }); }
        function mark() {
            items().forEach(function (el) {
                el.setAttribute('draggable', 'true');
                var a = el.querySelector('a');
                if (a) a.setAttribute('draggable', 'false');
            });
        }

        container.addEventListener('dragstart', function (e) {
            var el = e.target.closest(selector);
            if (!el || !container.contains(el)) return;
            dragEl = el;
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } catch (_) {}
            setTimeout(function () { el.classList.add('yf-dragging'); }, 0);
        });
        container.addEventListener('dragend', function () {
            if (dragEl) dragEl.classList.remove('yf-dragging');
            dragEl = null;
        });
        container.addEventListener('dragover', function (e) {
            if (!dragEl) return;
            e.preventDefault();
            var over = e.target.closest(selector);
            if (!over || over === dragEl || !container.contains(over)) return;
            var rect = over.getBoundingClientRect();
            var before;
            if (e.clientY < rect.top) before = true;
            else if (e.clientY > rect.bottom) before = false;
            else before = e.clientX < rect.left + rect.width / 2;
            if (before) container.insertBefore(dragEl, over);
            else container.insertBefore(dragEl, over.nextSibling);
        });
        container.addEventListener('drop', function (e) {
            e.preventDefault();
            if (onReorder) onReorder(order());
        });

        mark();
        return { refresh: mark };
    };
})();
