/**
 * La campana: globos de contador y el desplegable de escritorio (Bloque 4 + F2 de la capa social).
 *
 * Antes vivía dentro del script en línea de `Header.astro` y pintaba cada aviso como un enlace. Con
 * los avisos entre personas (que llevan botones) pasa a este módulo para pintar con
 * `lib/social/ui.ts`, el mismo marcado que la página `/mislistas/notificaciones` pinta en el
 * servidor. Los botones de los avisos los atiende `scripts/social/relations.ts`.
 *
 *   · Globos: `.js-notif-badge` (no leídos: campana, pestaña Perfil y hoja Perfil en móvil) y
 *     `.js-pending-badge` (solicitudes de amistad sin responder, F3). Un solo endpoint
 *     (`/api/notifications/counts`) al cargar la página, sin sondeo. Un caché de 60 s en
 *     localStorage evita repetirlo al navegar rápido; leer, leer todo y actuar lo actualizan.
 *   · Mensajes (M1): `.js-msg-badge` (contador `.mcnt` con número en `.js-msg-n`) y `.js-msg-dot`
 *     (globo sin número de la barra móvil). Llegan en la misma petición; en las páginas de mensajes
 *     el sondeo de 30 s los actualiza con el evento `yf:msg-total`.
 *   · Desplegable (≥1024 px): se piden los avisos CADA vez que se abre, con el estado actual de
 *     cada relación. En móvil la campana lleva a la página.
 */
import { notifFeedHtml } from '../../lib/social/ui';
import { SOCIAL_PHASE } from '../../utils/constants/social';
import type { NotifView } from '../../lib/social/types';

declare global {
    interface Window {
        yfHeaderPanels?: { isOpen(): boolean; close(): void }[];
        yfClosePanels?: (except?: unknown) => void;
    }
}

// ---- Globos ------------------------------------------------------------------------------
const KEY = 'yf_counts';
const TTL = 60 * 1000;

interface Counts { unread: number; pending: number; messages: number; ts: number }

function readCache(): Counts | null {
    try {
        const o = JSON.parse(localStorage.getItem(KEY) || 'null');
        return o && typeof o.unread === 'number' ? o : null;
    } catch { return null; }
}
function writeCache(c: Omit<Counts, 'ts'>) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...c, ts: Date.now() })); } catch { /* sin almacenamiento */ }
}

function paint(selector: string, n: number, label: (n: number) => string) {
    const txt = n > 9 ? '9+' : String(n);
    document.querySelectorAll<HTMLElement>(selector).forEach((b) => {
        b.hidden = n <= 0;
        if (n > 0) { b.textContent = txt; b.setAttribute('aria-label', label(n)); }
    });
    // Filas que cambian de aspecto con pendientes (la de «Amigos» en la hoja Perfil).
    if (selector === '.js-pending-badge') {
        // Con pendientes, la fila «Amigos» de la hoja Perfil se tiñe y lleva directa a «Pendientes».
        document.querySelectorAll<HTMLAnchorElement>('.js-pending-row').forEach((r) => {
            r.classList.toggle('has-pending', n > 0);
            r.href = n > 0 ? '/mislistas/amigos?tab=pendientes' : '/mislistas/amigos';
        });
        document.querySelectorAll<HTMLElement>('.js-pending-line').forEach((l) => {
            l.hidden = n <= 0;
            l.textContent = n === 1 ? '1 solicitud sin responder' : `${n} solicitudes sin responder`;
        });
    }
}

/** Contador de mensajes: número con su icono (no se toca el icono) y globo sin número. */
function paintMessages(n: number) {
    const label = n === 1 ? '1 mensaje sin leer' : `${n} mensajes sin leer`;
    document.querySelectorAll<HTMLElement>('.js-msg-badge').forEach((b) => {
        b.hidden = n <= 0;
        if (n <= 0) return;
        const num = b.querySelector('.js-msg-n');
        if (num) num.textContent = n > 99 ? '99+' : String(n);
        b.setAttribute('aria-label', label);
    });
    document.querySelectorAll<HTMLElement>('.js-msg-dot').forEach((d) => {
        d.hidden = n <= 0;
        if (n > 0) d.setAttribute('aria-label', label);
    });
}

let counts = { unread: 0, pending: 0, messages: 0 };
function setCounts(c: { unread: number; pending: number; messages?: number }, save = true) {
    counts = {
        unread: Math.max(0, c.unread | 0),
        pending: Math.max(0, c.pending | 0),
        messages: Math.max(0, (c.messages ?? 0) | 0),
    };
    paint('.js-notif-badge', counts.unread, (n) => (n === 1 ? '1 notificación sin leer' : `${n} notificaciones sin leer`));
    paint('.js-pending-badge', counts.pending, (n) => (n === 1 ? '1 solicitud' : `${n} solicitudes`));
    paintMessages(counts.messages);
    if (save) writeCache(counts);
}

function fetchCounts() {
    fetch('/api/notifications/counts', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setCounts({ unread: d.unread, pending: d.pendingFriends, messages: d.messages }); })
        .catch(() => {});
}

const hasBadges = document.querySelector('.js-notif-badge, .js-pending-badge, .js-msg-badge, .js-msg-dot');
if (hasBadges) {
    const c = readCache();
    if (c && Date.now() - c.ts < TTL) setCounts(c, false);
    else fetchCounts();
}

// Actuar desde un aviso (relations.ts) o abrirlo lo da por leído.
document.addEventListener('yf:notif-read', () => setCounts({ ...counts, unread: counts.unread - 1 }));
// Tiempo real (M3, scripts/social/live.ts): un aviso de la campana pide los números otra vez; uno de
// mensajes, solo el total de mensajes (en las páginas de mensajes ya lo hace su lista). Agrupados.
let liveTimer = 0;
document.addEventListener('yf:live-notif', () => {
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(fetchCounts, 300);
});
document.addEventListener('yf:live-msg', () => {
    if (document.querySelector('[data-ms-shell]')) return;
    fetch('/api/social/messages/unread', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && typeof d.total === 'number') setCounts({ ...counts, messages: d.total }); })
        .catch(() => {});
});

// Mensajes: el sondeo de las páginas de mensajes o leer una conversación traen el total nuevo.
document.addEventListener('yf:msg-total', (e) => {
    const total = (e as CustomEvent<{ total: number }>).detail?.total;
    if (typeof total === 'number') setCounts({ ...counts, messages: total });
});
// Aceptar o rechazar una solicitud (desde donde sea) baja el número rojo.
document.addEventListener('yf:pending-delta', (e) => {
    const delta = (e as CustomEvent<{ delta: number }>).detail?.delta ?? 0;
    setCounts({ ...counts, pending: counts.pending + delta });
});

function clearUnread(el: HTMLElement) {
    el.classList.remove('is-unread');
    el.querySelector('.notif-dot')?.remove();
    el.querySelectorAll(':scope > .sr-only').forEach((x) => { if (x.textContent === 'sin leer') x.remove(); });
    const label = el.getAttribute('aria-label');
    if (label) el.setAttribute('aria-label', label.replace(/, sin leer$/, ''));
}

function markRead(item: HTMLElement) {
    if (!item.classList.contains('is-unread')) return;
    clearUnread(item);
    // Si era el último sin leer de su grupo, el grupo también.
    const g = item.closest<HTMLElement>('.nt-grp.is-unread');
    if (g && !g.querySelector('.notif-item.is-unread')) { g.classList.remove('is-unread'); g.querySelector(':scope > summary .notif-dot')?.remove(); }
    setCounts({ ...counts, unread: counts.unread - 1 });
    fetch('/api/notifications', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'read', id: item.dataset.id }),
    }).catch(() => {});
}

/**
 * Clics dentro de una lista de avisos (desplegable o página): abrir un aviso de siempre, o el
 * nombre de un aviso social, lo marca leído. Los botones (`data-sa`) no: eso lo hace la acción
 * cuando sale bien.
 */
export function wireNotifList(list: HTMLElement) {
    // Abrir un grupo (7.3) da por leídos todos sus avisos de una vez. `toggle` no burbujea: en captura.
    list.addEventListener('toggle', (e) => {
        const g = e.target as HTMLDetailsElement;
        if (!g.classList?.contains('nt-grp') || !g.open || !g.classList.contains('is-unread')) return;
        const unread = Array.from(g.querySelectorAll<HTMLElement>('.notif-item.is-unread'));
        g.classList.remove('is-unread');
        g.querySelector(':scope > summary .notif-dot')?.remove();
        unread.forEach(clearUnread);
        if (!unread.length) return;
        setCounts({ ...counts, unread: counts.unread - unread.length });
        fetch('/api/notifications', {
            method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op: 'read_many', ids: unread.map((el) => el.dataset.id) }),
        }).catch(() => {});
    }, true);
    list.addEventListener('click', (e) => {
        const t = e.target as Element;
        if (t.closest('[data-sa]')) return;
        const item = t.closest<HTMLElement>('.notif-item');
        if (!item) return;
        if (item.tagName === 'A' || t.closest('[data-notif-open]')) markRead(item);
    });
}

export function markAllRead(scope: ParentNode): Promise<void> {
    return fetch('/api/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'read_all' }),
    }).then(() => {
        scope.querySelectorAll<HTMLElement>('.notif-item.is-unread').forEach(clearUnread);
        scope.querySelectorAll<HTMLElement>('.nt-grp.is-unread').forEach((g) => { g.classList.remove('is-unread'); g.querySelector(':scope > summary .notif-dot')?.remove(); });
        setCounts({ ...counts, unread: 0 });
    }).catch(() => {});
}

// ---- Desplegable de escritorio ------------------------------------------------------------
const btn = document.getElementById('notif-toggle-btn');
const drop = document.getElementById('notif-dropdown');
const list = document.getElementById('notif-list');
const markAllBtn = document.getElementById('notif-markall');

if (btn && drop && list) {
    let isOpen = false;
    let seq = 0;

    const render = (items: NotifView[]) => {
        if (!items.length) { list.innerHTML = '<p class="notif-empty">No hay notificaciones.</p>'; return; }
        list.innerHTML = notifFeedHtml(items, { phase: SOCIAL_PHASE, now: Date.now() });
    };

    const load = () => {
        const mine = ++seq;
        if (!list.querySelector('.notif-item')) list.innerHTML = '<p class="notif-empty">Cargando…</p>';
        fetch('/api/notifications', { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (mine !== seq) return;
                if (!d || !d.ok) { list.innerHTML = '<p class="notif-empty">No se pudieron cargar.</p>'; return; }
                render(d.items || []);
                setCounts({ ...counts, unread: d.unread });
            })
            .catch(() => { list.innerHTML = '<p class="notif-empty">No se pudieron cargar.</p>'; });
    };

    const setOpen = (v: boolean) => {
        isOpen = v;
        btn.setAttribute('aria-expanded', v ? 'true' : 'false');
        drop.style.display = v ? 'block' : 'none';
        if (v) load();
    };

    const panel = { isOpen: () => isOpen, close: () => setOpen(false) };
    window.yfHeaderPanels?.push(panel);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Móvil (<1024px): el desplegable no cabe → la página (como el calendario).
        if (window.innerWidth < 1024) { window.location.href = '/mislistas/notificaciones'; return; }
        if (!isOpen) window.yfClosePanels?.(panel);
        setOpen(!isOpen);
    });
    // Fuera cierra; dentro no (los botones de un aviso no deben cerrar el desplegable).
    document.addEventListener('click', (e) => {
        const t = e.target as Node;
        if (isOpen && t.isConnected && !drop.contains(t) && !btn.contains(t)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) setOpen(false); });

    wireNotifList(list);
    markAllBtn?.addEventListener('click', () => { markAllRead(list); });
}
