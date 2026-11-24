/**
 * Episodios de cada temporada de la ficha de serie, al abrirla (QA 7.3, H82).
 *
 * La ficha deja en cada `<details class="sr">` un hueco `[data-sr-body="/serie/{id}/episodios/{n}"]`; al
 * abrir la temporada (o antes, al pasar el ratón o el foco por su cabecera, para que al abrir ya esté)
 * se pide esa ruta y se mete su HTML. Después se engancha lo de siempre: los formularios «Visto» y
 * «Marcar temporada» (`initOptimisticActions` de public/js/optimistic-actions.js, que se salta los que
 * ya conoce); los spoilers (`scripts/ui/spoil.ts`) van por delegación y no necesitan nada.
 *
 * Si falla, el hueco dice que no se ha podido cargar y ofrece reintentar.
 */
type State = 'loading' | 'ok';

function load(body: HTMLElement): void {
    const url = body.dataset.srBody;
    if (!url || body.dataset.srState) return;
    body.dataset.srState = 'loading' satisfies State;
    fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((html) => {
            body.innerHTML = html;
            body.dataset.srState = 'ok' satisfies State;
            body.removeAttribute('aria-busy');
            (window as unknown as { initOptimisticActions?: () => void }).initOptimisticActions?.();
        })
        .catch(() => {
            delete body.dataset.srState;
            body.innerHTML = '<p class="sr-loading">No se han podido cargar los episodios. '
                + '<button type="button" class="btn btn--sm btn--ghost" data-sr-retry>Reintentar</button></p>';
        });
}

document.querySelectorAll<HTMLDetailsElement>('details.sr').forEach((details) => {
    const body = details.querySelector<HTMLElement>(':scope > [data-sr-body]');
    if (!body) return;
    const summary = details.querySelector<HTMLElement>(':scope > summary');
    details.addEventListener('toggle', () => { if (details.open) load(body); });
    summary?.addEventListener('pointerenter', () => load(body), { once: true });
    summary?.addEventListener('focus', () => load(body), { once: true });
    if (details.open) load(body);
});

document.addEventListener('click', (e) => {
    const retry = (e.target as HTMLElement).closest<HTMLElement>('[data-sr-retry]');
    const body = retry?.closest<HTMLElement>('[data-sr-body]');
    if (body) load(body);
});
