/**
 * Toasts de la capa social, sobre el `#toast-container` de siempre (Layout). Con `undo`, lleva el
 * botón «Deshacer» y dura 6 s (Eliminar amigo en F3, recomendar en F4); sin él, 2,8 s.
 */
export function showToast(message: string, type: 'success' | 'error' = 'success', undo?: () => void): void {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}${undo ? ' so-undo-toast' : ''}`;
    el.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);
    if (undo) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Deshacer';
        b.addEventListener('click', () => { el.remove(); undo(); });
        el.appendChild(b);
    }
    box.appendChild(el);
    window.setTimeout(() => {
        el.style.animation = 'toastOut 0.3s ease forwards';
        window.setTimeout(() => el.remove(), 300);
    }, undo ? 6000 : 2800);
}
