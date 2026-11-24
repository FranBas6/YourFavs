/**
 * Las estrellas de la nota (components/title/StarRating.astro): pintar al arrastrar y guardar al soltar
 * (con teclado, al pulsar Intro, al salir o tras un segundo). En un módulo aparte (QA 8.6) para que las
 * fichas lo carguen siempre: con la recarga suave, una tarjeta de nota puede aparecer sin haberse pintado
 * al cargar. Se engancha a lo nuevo con `yf:soft-swap` (public/js/optimistic-actions.js).
 */
function initStarRating(root: HTMLElement) {
    if (root.dataset.starInit === '1') return;
    root.dataset.starInit = '1';

    const range = root.querySelector<HTMLInputElement>('.rating-range');
    const save = root.querySelector<HTMLButtonElement>('.rating-save');
    if (!range) return;

    const fills = root.querySelectorAll<HTMLElement>('.star-fill');
    const wrap = root.parentElement;
    const label = wrap?.querySelector<HTMLElement>('.rating-label');
    const scale = wrap?.querySelector<HTMLElement>('.rating-scale');
    const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });

    // Una estrella = un punto → el relleno solo puede ser 0, 50 o 100 %.
    const paint = (rating: number) => {
        fills.forEach((el, i) => {
            const pct = Math.max(0, Math.min(1, rating - i)) * 100;
            el.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        });
        if (label) label.textContent = rating > 0 ? fmt(rating) : '';
        if (scale) scale.hidden = rating <= 0;
        range.setAttribute('aria-valuetext', rating > 0 ? `${fmt(rating)} de 10` : 'sin nota');
    };

    // `input` = pintar mientras se arrastra. `change` = al soltar, guardar.
    range.addEventListener('input', () => paint(Number(range.value)));
    const commit = () => {
        // El 0 existe solo para que la posición cuadre con las estrellas; como nota no
        // vale, se sube al mínimo real antes de enviar.
        if (Number(range.value) < 0.5) { range.value = '0.5'; paint(0.5); }
        // Se dispara un click en el botón (en vez de requestSubmit) porque la capa
        // optimista lee `e.submitter`: sin botón asociado abortaría el envío.
        if (save) save.click();
    };
    // Teclado (QA 3.3, H27): cada flecha disparaba `change`, guardaba y recargaba la página, así que no
    // se podía llegar a la nota deseada. Con teclado se guarda al pulsar Intro, al salir del control o
    // tras un segundo sin tocarlo; con ratón o dedo, al soltar, como siempre.
    let viaKey = false;
    let pending: number | undefined;
    const flush = () => { if (pending !== undefined) { window.clearTimeout(pending); pending = undefined; commit(); } };
    range.addEventListener('pointerdown', () => { viaKey = false; });
    range.addEventListener('keydown', (e) => {
        viaKey = true;
        if (e.key === 'Enter') { e.preventDefault(); if (pending === undefined) pending = 0; flush(); }
    });
    range.addEventListener('change', () => {
        if (!viaKey) { commit(); return; }
        window.clearTimeout(pending);
        pending = window.setTimeout(() => { pending = undefined; commit(); }, 1000);
    });
    range.addEventListener('blur', flush);

    // Con JS el guardado es automático al soltar → el botón solo existe para el
    // camino sin JS y para que la capa optimista tenga un `submitter`.
    if (save) save.hidden = true;
}

function initAllStarRatings() {
    document.querySelectorAll<HTMLElement>('.rating-form').forEach(initStarRating);
}

initAllStarRatings();
document.addEventListener('astro:after-swap', initAllStarRatings);
// QA 8.6: tras la recarga suave de la ficha (public/js/optimistic-actions.js), las nuevas.
document.addEventListener('yf:soft-swap', initAllStarRatings);

export {};
