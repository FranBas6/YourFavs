/**
 * Centro «Amigos» (`/mislistas/amigos`): pestañas, «Cargar más», buscador y copiar tu enlace.
 * La página llega con la pestaña de `?tab=` ya pintada; esto pinta el resto con
 * `lib/social/amigosView.ts`, el mismo marcado del servidor. Los botones de las filas los atiende
 * `scripts/social/relations.ts`.
 *
 *   · Pestañas (`tablist`): clic o ←/→/Inicio/Fin. La pestaña va a la URL (`?tab=`) sin recargar.
 *   · Buscador: desde 2 caracteres y 250 ms sin teclear, los resultados SUSTITUYEN a pestañas y
 *     panel. Esc o vaciar el campo devuelve la vista anterior. «/» pone el foco en él.
 */
import { moreButtonHtml, panelHtml, rowsHtml, searchHtml } from '../../lib/social/amigosView';
import { SOCIAL_PHASE } from '../../utils/constants/social';
import type { FriendsTab, PersonEntry, Relation } from '../../lib/social/types';

const root = document.querySelector<HTMLElement>('[data-am]');
if (root) init(root);

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
    const ctx = { phase: SOCIAL_PHASE, myHandle: root.dataset.myHandle || null };
    const panel = document.getElementById('am-panel');
    const tabsView = document.getElementById('am-tabsview');
    const results = document.getElementById('am-results');
    const input = document.getElementById('am-q') as HTMLInputElement | null;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.am-tab')];
    let current = (root.dataset.tab || 'siguiendo') as FriendsTab;
    let seq = 0;

    // ---- Pestañas -----------------------------------------------------------------------
    async function fetchTab(tab: FriendsTab, offset = 0): Promise<{ items: PersonEntry[]; hasMore: boolean; sent?: PersonEntry[] } | null> {
        try {
            const res = await fetch(`/api/social/lists?tab=${tab}&offset=${offset}`, { headers: { Accept: 'application/json' } });
            const d = await res.json();
            return res.ok && d.ok ? d : null;
        } catch { return null; }
    }

    async function showTab(tab: FriendsTab, focus = false) {
        if (!panel) return;
        current = tab;
        tabs.forEach((t) => {
            const on = t.dataset.tab === tab;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            if (on && focus) t.focus();
        });
        panel.setAttribute('aria-labelledby', `am-tab-${tab}`);
        const url = new URL(location.href);
        url.searchParams.set('tab', tab);
        history.replaceState(null, '', url);
        const mine = ++seq;
        panel.setAttribute('aria-busy', 'true');
        const d = await fetchTab(tab);
        if (mine !== seq) return;
        panel.removeAttribute('aria-busy');
        panel.innerHTML = d
            ? panelHtml(tab, d.items, { ...ctx, hasMore: d.hasMore, sent: d.sent })
            : '<p class="am-note">No se ha podido cargar. Inténtalo otra vez.</p>';
    }

    tabs.forEach((t, i) => {
        t.addEventListener('click', () => { if (t.dataset.tab !== current) showTab(t.dataset.tab as FriendsTab); });
        t.addEventListener('keydown', (e) => {
            const k = e.key;
            let j = -1;
            if (k === 'ArrowRight') j = (i + 1) % tabs.length;
            else if (k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
            else if (k === 'Home') j = 0;
            else if (k === 'End') j = tabs.length - 1;
            if (j < 0) return;
            e.preventDefault();
            showTab(tabs[j].dataset.tab as FriendsTab, true);
        });
    });

    // ---- «Cargar más» -----------------------------------------------------------------
    panel?.addEventListener('click', async (e) => {
        const more = (e.target as Element).closest<HTMLButtonElement>('[data-am-more]');
        if (!more) return;
        more.disabled = true;
        const offset = Number(more.dataset.amMore) || 0;
        const d = await fetchTab(current, offset);
        if (!d) { more.disabled = false; toast('No se ha podido cargar. Inténtalo otra vez.', 'error'); return; }
        panel.querySelector('.so-list')?.insertAdjacentHTML('beforeend', rowsHtml(current, d.items, ctx));
        if (d.hasMore) more.outerHTML = moreButtonHtml(offset + d.items.length);
        else more.remove();
    });

    // ---- Buscador ---------------------------------------------------------------------
    let timer = 0;
    let searching = false;
    function restore() {
        searching = false;
        seq++;
        if (results) { results.hidden = true; results.innerHTML = ''; }
        if (tabsView) tabsView.hidden = false;
        input?.setAttribute('aria-expanded', 'false');
    }
    async function search(q: string) {
        const mine = ++seq;
        try {
            const res = await fetch(`/api/social/people?q=${encodeURIComponent(q)}&limit=20`, { headers: { Accept: 'application/json' } });
            const d = await res.json();
            if (mine !== seq || !results) return;
            if (!res.ok || !d.ok) {
                results.innerHTML = `<p class="am-note">${res.status === 429 ? 'Vas muy rápido. Espera un momento.' : 'No se ha podido buscar. Inténtalo otra vez.'}</p>`;
            } else {
                results.innerHTML = searchHtml(q, d.items, ctx);
            }
            results.hidden = false;
            if (tabsView) tabsView.hidden = true;
            input?.setAttribute('aria-expanded', 'true');
            searching = true;
        } catch { /* sin red: se queda lo que había */ }
    }
    input?.addEventListener('input', () => {
        window.clearTimeout(timer);
        const q = input.value.trim();
        if (q.replace(/^@/, '').length < 2) { restore(); return; }
        timer = window.setTimeout(() => search(q), 250);
    });
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (input.value || searching)) {
            e.preventDefault();
            input.value = '';
            window.clearTimeout(timer);
            restore();
        }
    });
    // «/» pone el foco en el buscador (salvo escribiendo en otro campo).
    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement;
        if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        input?.focus();
    });

    // ---- Botones de los vacíos y del lateral ------------------------------------------
    root.addEventListener('click', async (e) => {
        const t = e.target as Element;
        if (t.closest('[data-am-focus]')) { input?.focus(); return; }
        if (t.closest('[data-am-copy]')) {
            const url = root.dataset.url;
            if (!url) return;
            try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
            catch { toast('No se pudo copiar el enlace', 'error'); }
        }
    });

    // ---- Tras una acción (relations.ts) -----------------------------------------------
    function bumpCount(tab: FriendsTab, delta: number) {
        const c = root.querySelector<HTMLElement>(`[data-count="${tab}"]`);
        if (!c) return;
        const n = Math.max(0, (Number(c.textContent) || 0) + delta);
        c.textContent = String(n);
        const hot = tab === 'pendientes' && n > 0;
        c.classList.toggle('hot', hot);
        c.setAttribute('aria-label', hot ? `${n} sin responder` : String(n));
    }
    /** Quita una fila de la pestaña abierta (y de su grupo, en Pendientes). */
    function dropRow(uid: string, list?: 'received' | 'sent') {
        if (!panel) return;
        const scope = list ? panel.querySelector(`[data-list="${list}"]`) : panel;
        const row = scope?.querySelector<HTMLElement>(`.so-row[data-person="${CSS.escape(uid)}"]`);
        if (!row) return;
        row.remove();
        if (list) {
            const g = panel.querySelector<HTMLElement>(`[data-grp="${list}"] [data-grp-n]`);
            if (g) g.textContent = String(Math.max(0, (Number(g.textContent) || 1) - 1));
            if (!scope!.querySelector('.so-row')) {
                // Grupo vacío: fuera su rótulo, su lista y su nota; sin nada más, el vacío de la pestaña.
                panel.querySelector(`[data-grp="${list}"]`)?.remove();
                const next = scope!.nextElementSibling;
                scope!.remove();
                if (list === 'received' && next?.classList.contains('am-note')) next.remove();
                if (!panel.querySelector('.so-row')) panel.innerHTML = panelHtml('pendientes', [], { ...ctx, hasMore: false });
            }
        } else if (!panel.querySelector('.so-row')) {
            panel.innerHTML = panelHtml(current, [], { ...ctx, hasMore: false });
        }
    }
    document.addEventListener('yf:relation', (e) => {
        const { uid, rel, action } = (e as CustomEvent<{ uid: string; rel: Relation; action: string }>).detail;
        if (action === 'friend-accept') { bumpCount('pendientes', -1); bumpCount('amigos', 1); }
        if (action === 'friend-reject') bumpCount('pendientes', -1);
        if (action === 'friend-remove') bumpCount('amigos', -1);
        if (action === 'friend-restore') bumpCount('amigos', 1);
        if (action === 'unblock') bumpCount('bloqueados', -1);
        if (searching || !rel) return;
        if (current === 'bloqueados' && !rel.blockedByMe) dropRow(uid);
        if (current === 'pendientes' && (action === 'friend-accept' || action === 'friend-reject')) dropRow(uid, 'received');
        if (current === 'pendientes' && action === 'friend-cancel' && !rel.requestOut) dropRow(uid, 'sent');
        if (current === 'amigos' && action === 'friend-remove') dropRow(uid);
        if (current === 'amigos' && action === 'friend-restore') showTab('amigos');
    });
}
