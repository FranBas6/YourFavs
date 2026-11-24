/**
 * «Ocultar de mi perfil» (components/social/HideFromProfileToggle.astro), por delegación. En un módulo
 * aparte (QA 8.6) para que las fichas lo carguen siempre: con la recarga suave, el interruptor puede
 * aparecer sin haberse pintado al cargar.
 */
document.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (!input?.matches?.('[data-hide-profile]')) return;
    const hide = input.checked;
    input.disabled = true;
    let ok = false;
    try {
        const res = await fetch('/api/profile/hidden', {
            method: hide ? 'POST' : 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mediaType: input.dataset.mt, tmdbId: Number(input.dataset.id),
                title: input.dataset.title, posterPath: input.dataset.poster || null,
            }),
        });
        const data = await res.json().catch(() => ({}));
        ok = res.ok && data.ok;
    } catch { /* red */ }
    input.disabled = false;
    if (!ok) input.checked = !hide;
    const box = document.getElementById('toast-container');
    if (box) {
        const t = document.createElement('div');
        t.className = `toast toast-${ok ? 'success' : 'error'}`;
        t.textContent = ok ? (hide ? 'Oculto de tu perfil' : 'Vuelve a salir en tu perfil') : 'No se pudo guardar';
        box.appendChild(t);
        setTimeout(() => t.remove(), 2800);
    }
});

export {};
