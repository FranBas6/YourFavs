/**
 * «Mostrar» en el modo sin spoilers (TMDB D4): revela su `.yf-spoil`, devuelve lo difuminado al
 * lector de pantalla y al teclado (quita `aria-hidden` e `inert`) y lleva el foco al contenido.
 * Delegado en el documento: vale para lo que se pinte después.
 */
document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest?.('.yf-spoil-btn');
    if (!btn) return;
    const host = btn.closest('.yf-spoil');
    if (!host) return;
    revealSpoiler(host as HTMLElement);
    const first = host.querySelector<HTMLElement>('.yf-blur');
    if (first) { first.tabIndex = -1; first.focus({ preventScroll: true }); }
});

export function revealSpoiler(host: HTMLElement): void {
    host.classList.add('revealed');
    host.querySelectorAll<HTMLElement>('.yf-blur').forEach((el) => {
        el.removeAttribute('aria-hidden');
        el.removeAttribute('inert');
    });
}
