/**
 * Página de saga (2026-11-23, C3): compartir. El navegador del móvil abre su hoja de compartir; donde
 * no la hay, se copia el enlace. («Pendiente» por película y en bloque llegan en el paso siguiente.)
 */
import { showToast } from '../social/toast';

document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-saga-share]');
    if (!btn) return;
    const url = location.origin + location.pathname;
    const title = btn.dataset.title || document.title;
    if (navigator.share) {
        try { await navigator.share({ title, url }); } catch { /* cancelado */ }
        return;
    }
    try {
        await navigator.clipboard.writeText(url);
        showToast('Enlace copiado');
    } catch {
        showToast('No se ha podido copiar el enlace', 'error');
    }
});

// Visor de imágenes (CSS :target): teclado. Esc cierra; ← y → pasan de imagen.
document.addEventListener('keydown', (e) => {
    const open = location.hash.startsWith('#sg-img-') ? document.querySelector<HTMLElement>(location.hash) : null;
    if (!open) return;
    const go = (sel: string) => { const a = open.querySelector<HTMLAnchorElement>(sel); if (a) location.replace(a.href); };
    if (e.key === 'Escape') { e.preventDefault(); location.replace('#_'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go('[data-lb-prev]'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go('[data-lb-next]'); }
});
