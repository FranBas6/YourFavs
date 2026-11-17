/**
 * Reordenar las secciones del perfil público arrastrando (F6 social, Ajustes → «Perfil público»).
 *
 * El arrastre es el de «Tu Home» (`reorder.ts`): ratón, dedo con pulsación mantenida y ↑/↓ en el
 * asa. Aquí no hay separador de ocultas: una sección apagada se queda en su sitio, y el orden vale
 * para cuando la vuelvas a encender.
 *
 * Guardado: no se toca la red desde aquí. Se emite `yf:reorder` y `autosave.ts` lee las filas en su
 * orden (`data-save-order`) y las manda, con su mismo indicador «Guardando… / Guardado».
 */
import { initReorder } from './reorder';

const list = document.querySelector<HTMLElement>('[data-save-group="sections"]');
if (list) init(list);

function init(list: HTMLElement) {
    const live = document.getElementById('pp-sec-live');
    const rows = () => Array.from(list.querySelectorAll<HTMLElement>('[data-section-row]'));
    const save = () => document.dispatchEvent(new CustomEvent('yf:reorder', { detail: { field: 'sections' } }));

    function announce(row: HTMLElement) {
        if (!live) return;
        const title = row.querySelector('.aj-row-title')?.textContent?.trim() || 'Sección';
        const all = rows();
        live.textContent = `${title}, posición ${all.indexOf(row) + 1} de ${all.length}`;
    }

    const { flip } = initReorder(list, {
        rowSelector: '[data-section-row]',
        handleSelector: '[data-sec-handle]',
        onCommit: save,
        onKeyMove: announce,
    });

    // Orden canónico = el de PUBLIC_SECTIONS, que el markup trae en `data-default`.
    document.getElementById('pp-sec-reset')?.addEventListener('click', () => {
        const canonical = [...rows()].sort((a, b) => Number(a.dataset.default || 0) - Number(b.dataset.default || 0));
        if (canonical.every((r, i) => r === rows()[i])) return;
        flip(() => { for (const r of canonical) list.appendChild(r); });
        save();
        if (live) live.textContent = 'Orden restablecido';
    });
}
