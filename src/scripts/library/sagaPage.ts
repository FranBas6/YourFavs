/**
 * Página de saga (2026-11-23, C3):
 *  - Compartir: el navegador del móvil abre su hoja de compartir; donde no la hay, se copia el enlace.
 *  - «Pendiente» de cada fila (`data-saga-pend`, `aria-pressed`): marca y desmarca sin recargar.
 *  - «Añadir las que me faltan a Pendientes (N)» (`data-saga-pend-all`): las filas sin marcar, de una vez.
 *    N se recuenta al tocar filas y, con 0, el botón se esconde.
 * Todo va a POST /api/lists/fixed (lista 'pendientes'); cada cambio, con aviso y «Deshacer». Se pinta
 * antes de que conteste el servidor y, si falla, se vuelve atrás.
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

// --- Pendientes --------------------------------------------------------------------------------------

type Op = 'add' | 'remove';

async function savePending(ids: number[], action: Op): Promise<boolean> {
    try {
        const res = await fetch('/api/lists/fixed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ids.length === 1
                ? { media_type: 'movie', tmdb_id: ids[0], list: 'pendientes', action }
                : { media_type: 'movie', tmdb_ids: ids, list: 'pendientes', action }),
        });
        const data = await res.json().catch(() => null);
        return res.ok && !!data?.ok;
    } catch {
        return false;
    }
}

const rowButton = (id: number) => document.querySelector<HTMLButtonElement>(`[data-saga-pend="${id}"]`);
const setPressed = (ids: number[], on: boolean) => ids.forEach((id) => rowButton(id)?.setAttribute('aria-pressed', on ? 'true' : 'false'));
const unpressed = () => [...document.querySelectorAll<HTMLButtonElement>('[data-saga-pend][aria-pressed="false"]')];

/** Recuenta «las que me faltan» y esconde el botón de bloque con 0. */
function refreshBulk(): void {
    const btn = document.querySelector<HTMLButtonElement>('[data-saga-pend-all]');
    if (!btn) return;
    const n = unpressed().length;
    const out = btn.querySelector('[data-n]');
    if (out) out.textContent = String(n);
    btn.hidden = n === 0;
}

/** Aplica el cambio (pintado ya), y si el servidor falla, lo deshace en pantalla. */
async function apply(ids: number[], action: Op, busy: HTMLElement[]): Promise<boolean> {
    setPressed(ids, action === 'add');
    refreshBulk();
    busy.forEach((b) => b.setAttribute('aria-busy', 'true'));
    const ok = await savePending(ids, action);
    busy.forEach((b) => b.removeAttribute('aria-busy'));
    if (!ok) {
        setPressed(ids, action !== 'add');
        refreshBulk();
        showToast('No se ha podido guardar. Inténtalo otra vez', 'error');
    }
    return ok;
}

function undoOf(ids: number[], action: Op, busy: () => HTMLElement[]): () => void {
    const back: Op = action === 'add' ? 'remove' : 'add';
    return () => { void apply(ids, back, busy()); };
}

document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const row = target.closest<HTMLButtonElement>('[data-saga-pend]');
    if (row) {
        const id = Number(row.dataset.sagaPend);
        const action: Op = row.getAttribute('aria-pressed') === 'true' ? 'remove' : 'add';
        const title = row.dataset.title || 'La película';
        const busy = () => [rowButton(id)].filter(Boolean) as HTMLElement[];
        if (await apply([id], action, busy())) {
            showToast(action === 'add' ? `${title}, en Pendientes` : `${title}, fuera de Pendientes`, 'success', undoOf([id], action, busy));
        }
        return;
    }

    const all = target.closest<HTMLButtonElement>('[data-saga-pend-all]');
    if (all) {
        const rows = unpressed();
        const ids = rows.map((b) => Number(b.dataset.sagaPend)).filter((n) => n > 0);
        if (!ids.length) return;
        const busy = () => [all, ...ids.map(rowButton)].filter(Boolean) as HTMLElement[];
        if (await apply(ids, 'add', busy())) {
            const msg = ids.length === 1 ? `${rows[0].dataset.title || 'La película'}, en Pendientes` : `${ids.length} películas añadidas a Pendientes`;
            showToast(msg, 'success', undoOf(ids, 'add', busy));
        }
    }
});
