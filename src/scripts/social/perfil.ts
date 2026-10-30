/**
 * Interacción del perfil público (`/u/{handle}`). La página llega pintada del servidor; esto solo
 * añade lo que necesita JS:
 *
 *   · Compartir: hoja nativa (`navigator.share`) en móvil; copiar el enlace en escritorio.
 *   · «Ocultar» (solo dueño): quita el título de «Lo último visto» / «Mejor valoradas» con
 *     `POST /api/profile/hidden`, y ofrece Deshacer (`DELETE`) devolviéndolo a su sitio.
 *   · Arquetipo (solo dueño): si el guardado tiene más de 7 días, se recalcula en segundo plano.
 *   · Invitado: recuerda por qué perfil llegó (cookie `yf_ref`, 30 días) para que, si crea la
 *     cuenta, siga a esa persona y el modal diga quién le invita (F2). Va en el navegador porque
 *     la página del invitado sale del CDN y no puede llevar `Set-Cookie`.
 *
 * Seguir, bloquear y demás botones de relación los atiende `scripts/social/relations.ts`.
 */
export {};

const page = document.querySelector<HTMLElement>('[data-pf-page]');
if (page) init(page);

function toast(message: string, type: 'success' | 'error' = 'success') {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    window.setTimeout(() => {
        el.style.animation = 'toastOut 0.3s ease forwards';
        window.setTimeout(() => el.remove(), 300);
    }, 2500);
}

function init(root: HTMLElement) {
    const url = root.dataset.url || location.href;
    const name = root.dataset.name || '';

    // ---- Llegada por enlace (invitado) -------------------------------------------------
    // La última dirección visitada es la que cuenta: es el enlace que acabó convenciendo.
    if (root.dataset.guest && root.dataset.handle) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `yf_ref=${encodeURIComponent(root.dataset.handle)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
    }

    // ---- Compartir / copiar enlace -----------------------------------------------
    // Hoja nativa solo donde tiene sentido (pantallas táctiles): en escritorio, Chrome y Safari
    // también tienen `navigator.share`, pero ahí lo esperado es copiar el enlace.
    const touch = window.matchMedia('(hover: none)').matches;
    async function share() {
        if (touch && typeof navigator.share === 'function') {
            try { await navigator.share({ title: `${name} en YourFavs`, url }); } catch { /* cancelado */ }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            toast('Enlace copiado');
        } catch {
            toast('No se pudo copiar el enlace', 'error');
        }
    }
    async function copyLink() {
        try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
        catch { toast('No se pudo copiar el enlace', 'error'); }
    }

    // ---- Menús -----------------------------------------------------------------------
    // Abrirlos y cerrarlos lo hace scripts/social/relations.ts en toda la app; aquí solo se cierra
    // el de «···» tras «Copiar enlace», que no es una acción de relación.
    function closeMenus() {
        root.querySelectorAll<HTMLElement>('[data-menu-toggle][aria-expanded="true"]').forEach((btn) => {
            btn.setAttribute('aria-expanded', 'false');
            const menu = btn.parentElement?.querySelector<HTMLElement>('.pf-menu');
            if (menu) menu.hidden = true;
        });
    }

    // ---- Deshacer --------------------------------------------------------------------
    const undoBar = document.getElementById('pf-undo');
    const undoMsg = document.getElementById('pf-undo-msg');
    const undoBtn = document.getElementById('pf-undo-do');
    let undoTimer = 0;
    let undoAction: (() => void) | null = null;
    function offerUndo(label: string, revert: () => void) {
        if (!undoBar || !undoMsg) return;
        window.clearTimeout(undoTimer);
        undoMsg.textContent = label;
        undoAction = revert;
        undoBar.hidden = false;
        undoTimer = window.setTimeout(() => { undoBar.hidden = true; undoAction = null; }, 6000);
    }
    undoBtn?.addEventListener('click', () => {
        const run = undoAction;
        undoAction = null;
        if (undoBar) undoBar.hidden = true;
        run?.();
    });

    // ---- Ocultar un título (dueño) ----------------------------------------------------
    async function setHidden(hide: boolean, body: Record<string, unknown>): Promise<boolean> {
        try {
            const res = await fetch('/api/profile/hidden', {
                method: hide ? 'POST' : 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            return res.ok && data.ok;
        } catch {
            return false;
        }
    }

    async function hide(btn: HTMLElement) {
        const item = btn.closest<HTMLElement>('.pf-tile, .pf-lc');
        if (!item || btn.dataset.busy) return;
        const ref = { mediaType: btn.dataset.mt, tmdbId: Number(btn.dataset.id) };
        const title = btn.dataset.title || 'el título';
        btn.dataset.busy = '1';
        const ok = await setHidden(true, { ...ref, title: btn.dataset.title, posterPath: btn.dataset.poster || null });
        delete btn.dataset.busy;
        if (!ok) { toast('No se pudo ocultar', 'error'); return; }

        // Se quita de la tira y se guarda su sitio para poder devolverlo.
        const parent = item.parentElement;
        const next = item.nextSibling;
        item.remove();
        offerUndo(`Ocultaste «${title}» de tu perfil`, async () => {
            if (await setHidden(false, ref)) {
                parent?.insertBefore(item, next && next.parentNode === parent ? next : null);
            } else {
                toast('No se pudo deshacer', 'error');
            }
        });
    }

    // ---- Delegación ---------------------------------------------------------------------
    root.addEventListener('click', (e) => {
        const t = e.target as Element;
        const hideBtn = t.closest<HTMLElement>('.js-pf-hide');
        if (hideBtn) { e.preventDefault(); hide(hideBtn); return; }
        const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
        if (action === 'share') { share(); return; }
        if (action === 'copy-link') { closeMenus(); copyLink(); return; }
        // recommend: llega en la F4.
    });

    // ---- Arquetipo (dueño) ------------------------------------------------------------
    if (root.dataset.archetypeStale === '1') {
        const go = () => { fetch('/api/profile/archetype', { method: 'POST' }).catch(() => {}); };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 4000 });
        else setTimeout(go, 2500);
    }
}
