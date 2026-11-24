/**
 * Enlaces superpuestos de la ficha de serie (QA 6.2, axe «nested-interactive»).
 *
 * El acordeón de temporadas y las filas «Último/Próximo» llevaban un enlace DENTRO del <summary> (un control
 * dentro de otro: el lector lo anuncia mal y Enter no se sabe qué hace). Ahora, en el <summary> queda el
 * texto (`[data-ovl-anchor]`, mismas clases y mismo aspecto) y el enlace de verdad (`[data-ovl-link]`) va
 * después del <details>, dentro de `.ovl-wrap`. Este script lo coloca exactamente encima del texto y lo
 * recoloca si algo cambia de tamaño. Fuera del <details>, porque lo que no es <summary> se oculta al cerrar.
 *
 * Zona táctil mínima de 24 px de alto (WCAG 2.5.8); en móvil el título de temporada ya mide 44 px por CSS.
 */
const MIN_H = 24;

function place(wrap: HTMLElement) {
    const anchor = wrap.querySelector<HTMLElement>('[data-ovl-anchor]');
    const link = wrap.querySelector<HTMLElement>(':scope > [data-ovl-link]');
    if (!anchor || !link) return;
    const a = anchor.getBoundingClientRect();
    if (!a.width) { link.hidden = true; return; }
    link.hidden = false;
    const w = wrap.getBoundingClientRect();
    const h = Math.max(a.height, MIN_H);
    link.style.left = `${a.left - w.left}px`;
    link.style.top = `${a.top - w.top - (h - a.height) / 2}px`;
    link.style.width = `${a.width}px`;
    link.style.height = `${h}px`;
}

function init() {
    const wraps = [...document.querySelectorAll<HTMLElement>('.ovl-wrap')];
    if (!wraps.length) return;
    const placeAll = () => wraps.forEach(place);
    placeAll();
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => placeAll());
        wraps.forEach((w) => {
            ro.observe(w);
            const a = w.querySelector('[data-ovl-anchor]');
            if (a) ro.observe(a);
        });
    } else {
        window.addEventListener('resize', placeAll);
    }
    // Las fuentes web cambian el ancho del texto al cargar.
    document.fonts?.ready.then(placeAll).catch(() => {});
}

init();
