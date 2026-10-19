/**
 * Acciones de relación en cualquier parte de la app (capa social F2 y F3): seguir, dejar de seguir,
 * bloquear, desbloquear, y pedir, cancelar, aceptar o rechazar amistad y eliminar amigo. Se carga
 * en todas las páginas con sesión (`SocialLayer.astro`).
 *
 * Funciona por delegación: cualquier botón con `data-sa` dentro de un elemento con
 * `data-person="{uid}"` (fila de persona, aviso de la campana, cabecera del perfil, sugerencia de
 * amistad, ⌘K). Al pulsar:
 *   1. el botón cambia al momento (optimista) y queda `aria-busy`;
 *   2. se llama al endpoint, que devuelve la relación NUEVA;
 *   3. se repintan TODAS las piezas de esa persona en la página con `lib/social/ui.ts`, el mismo
 *      marcado que pinta el servidor;
 *   4. si falla, se deja como estaba y sale un toast.
 *
 * También abre y cierra los menús de los botones (`[data-menu-toggle]`: «Amigos ▾», «Solicitud
 * enviada ▾», «···») en cualquier sitio, con flechas y Esc.
 *
 * Eventos para que cada página haga lo suyo: `yf:relation` ({ uid, rel, action }),
 * `yf:notif-read` ({ id }) y `yf:pending-delta` ({ delta }) para el número rojo.
 */
import {
    cmdkActionsHtml, firstName, notifSentenceHtml, notifZoneHtml, personRowHtml,
    profileActionsHtml, rowActionsHtml, type RowActions,
} from '../../lib/social/ui';
import { SOCIAL_PHASE } from '../../utils/constants/social';
import type { NotifView, PersonCard, PersonEntry, Relation } from '../../lib/social/types';

const phase = SOCIAL_PHASE;

function toast(message: string, type: 'success' | 'error' = 'success', undo?: () => void) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}${undo ? ' so-undo-toast' : ''}`;
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

/** Lo mínimo de la persona que necesitan los botones, leído de los data-* de su pieza. */
function personFrom(host: HTMLElement): PersonCard {
    return {
        id: host.dataset.person || '',
        handle: host.dataset.handle || null,
        name: host.dataset.name || '',
        avatar: null, archetype: null, color: 'slate', initials: '',
    };
}

// -------------------------------------------------------------------------------------
// Repintar
// -------------------------------------------------------------------------------------
/** Cómo queda la solicitud de un aviso tras actuar desde él. */
const REQ_AFTER: Record<string, NotifView['req']> = { 'friend-accept': 'accepted', 'friend-reject': 'rejected' };

function repaint(host: HTMLElement, rel: Relation, action: string) {
    const zone = host.querySelector<HTMLElement>('[data-rel-host]');
    if (!zone) return;
    const p = personFrom(host);
    const kind = zone.dataset.relHost;
    if (kind === 'row') {
        zone.innerHTML = rowActionsHtml(p, rel, { phase, actions: (zone.dataset.acts || 'row') as RowActions });
    } else if (kind === 'cmdk') {
        // El atajo ↵ de la fila resaltada se conserva.
        const enter = zone.querySelector('.cmdk-enter')?.outerHTML ?? '';
        zone.innerHTML = cmdkActionsHtml(p, rel, { phase }) + enter;
    } else if (kind === 'notif') {
        const type = host.dataset.type || '';
        let req = (host.dataset.req || undefined) as NotifView['req'];
        if (type === 'friend_request' && REQ_AFTER[action]) req = REQ_AFTER[action];
        host.dataset.req = req ?? '';
        const it = { type, actor: p, rel, req };
        const mobile = !!host.closest('[data-notif-page]');
        const z = notifZoneHtml(it, { phase, mobile });
        zone.innerHTML = z.html;
        const t = host.querySelector('.nt-t');
        if (t) t.innerHTML = notifSentenceHtml(it).html;
        host.setAttribute('aria-label', [notifSentenceHtml(it).plain, z.state].filter(Boolean).join(', '));
    } else if (kind === 'profile') {
        // «Solo amigos» que ya puedes ver (te aceptaron, o aceptaste tú): se recarga con todo.
        if (host.dataset.locked && rel.friends) { location.reload(); return; }
        zone.innerHTML = profileActionsHtml(p, rel, { phase, locked: !!host.dataset.locked });
    } else if (kind === 'sugg') {
        if (rel.friends || rel.requestOut) {
            zone.innerHTML = `<span class="pf-sugg-done">${rel.friends ? 'Ahora sois amigos' : 'Solicitud enviada'}</span>`;
        }
    }
}

function repaintAll(uid: string, rel: Relation, action: string) {
    document.querySelectorAll<HTMLElement>(`[data-person="${CSS.escape(uid)}"]`).forEach((h) => repaint(h, rel, action));
    document.dispatchEvent(new CustomEvent('yf:relation', { detail: { uid, rel, action } }));
}

/** Cambio optimista del botón pulsado, para que responda al instante. */
function optimistic(btn: HTMLElement, action: string) {
    btn.setAttribute('aria-busy', 'true');
    const svg = btn.querySelector('svg')?.outerHTML ?? '';
    if (action === 'follow') {
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.remove('pri');
        btn.innerHTML = `${svg}Siguiendo`;
    } else if (action === 'unfollow') {
        btn.setAttribute('aria-pressed', 'false');
    } else if (action === 'friend-request' && !btn.closest('[role="menu"]')) {
        btn.classList.remove('pri');
        btn.classList.add('wait');
        btn.innerHTML = `${svg}Solicitud enviada`;
    } else {
        (btn as HTMLButtonElement).disabled = true;
    }
}

const ENDPOINT: Record<string, [string, 'POST' | 'DELETE']> = {
    follow: ['/api/social/follow', 'POST'],
    unfollow: ['/api/social/follow', 'DELETE'],
    block: ['/api/social/block', 'POST'],
    unblock: ['/api/social/block', 'DELETE'],
    'friend-request': ['/api/social/requests', 'POST'],
    'friend-cancel': ['/api/social/requests', 'DELETE'],
    'friend-accept': ['/api/social/requests/accept', 'POST'],
    'friend-reject': ['/api/social/requests/reject', 'POST'],
    'friend-remove': ['/api/social/friends', 'DELETE'],
    'friend-restore': ['/api/social/friends/restore', 'POST'],
};

interface CallResult { ok: boolean; relation?: Relation; error?: string; status: number }

async function call(action: string, uid: string): Promise<CallResult> {
    const [url, method] = ENDPOINT[action];
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid }) });
        const data = await res.json().catch(() => ({}));
        return { ...data, ok: res.ok && data.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

const CAP_TEXT = 'Tienes 20 solicitudes sin responder. Cancela alguna para pedir más.';

function errorText(r: CallResult, action: string, name: string): string {
    if (r.error === 'unavailable') return action === 'follow'
        ? `Ahora mismo no se puede seguir a ${firstName(name)}.`
        : `Ahora mismo no se le puede pedir amistad a ${firstName(name)}.`;
    if (r.error === 'cap') return CAP_TEXT;
    if (r.error === 'gone') return 'Esa solicitud ya no está pendiente.';
    if (r.error === 'expired') return 'Ya no se puede deshacer.';
    if (r.status === 429) return 'Vas muy rápido. Espera un momento y vuelve a probar.';
    return 'No se ha podido. Inténtalo otra vez.';
}

/** Marca leído el aviso desde el que se actuó (sin recargar la lista). */
function markNotifRead(host: HTMLElement) {
    if (!host.classList.contains('notif-item') || !host.classList.contains('is-unread')) return;
    host.classList.remove('is-unread');
    host.querySelector('.notif-dot')?.remove();
    const id = host.dataset.id;
    if (!id) return;
    fetch('/api/notifications', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'read', id }) }).catch(() => {});
    document.dispatchEvent(new CustomEvent('yf:notif-read', { detail: { id } }));
}

async function run(action: string, btn: HTMLElement, host: HTMLElement) {
    const uid = host.dataset.person;
    if (!uid || btn.getAttribute('aria-busy') === 'true') return;
    const name = host.dataset.name || '';
    const before = btn.outerHTML;
    optimistic(btn, action);
    const r = await call(action, uid);
    if (!r.ok || !r.relation) {
        if (btn.isConnected) btn.outerHTML = before;
        if (r.error === 'no_profile') { openNoProfile(host, btn); return; }
        if (r.error === 'cap') {
            // El botón se queda deshabilitado con su explicación (handoff §6.1).
            const again = host.querySelector<HTMLButtonElement>('[data-sa="friend-request"]');
            if (again) { again.disabled = true; again.title = CAP_TEXT; }
        }
        toast(errorText(r, action, name), 'error');
        // Si el servidor trae la relación (p. ej. la solicitud ya no estaba), se repinta con ella.
        if (r.relation) repaintAll(uid, r.relation, action);
        return;
    }
    markNotifRead(host);
    if (action === 'friend-accept' || action === 'friend-reject') {
        document.dispatchEvent(new CustomEvent('yf:pending-delta', { detail: { delta: -1 } }));
    }
    repaintAll(uid, r.relation, action);
    if (action === 'friend-remove') {
        toast(`Has eliminado a ${name} de tus amigos`, 'success', async () => {
            const back = await call('friend-restore', uid);
            if (back.ok && back.relation) repaintAll(uid, back.relation, 'friend-restore');
            else toast(errorText(back, 'friend-restore', name), 'error');
        });
    }
}

// -------------------------------------------------------------------------------------
// Bloquear: siempre con confirmación (diálogo de SocialLayer.astro)
// -------------------------------------------------------------------------------------
const blockDlg = document.getElementById('so-block-dlg') as HTMLDialogElement | null;
let blockTarget: { host: HTMLElement; opener: HTMLElement } | null = null;

function fillNames(dlg: HTMLElement, name: string) {
    dlg.querySelectorAll<HTMLElement>('[data-bl-name]').forEach((el) => { el.textContent = name; });
    dlg.querySelectorAll<HTMLElement>('[data-bl-first]').forEach((el) => { el.textContent = firstName(name); });
}

function openBlock(host: HTMLElement, opener: HTMLElement) {
    if (!blockDlg) return;
    fillNames(blockDlg, host.dataset.name || '');
    blockTarget = { host, opener };
    blockDlg.showModal();
    blockDlg.querySelector<HTMLElement>('[data-bl-cancel]')?.focus();
}

blockDlg?.addEventListener('close', () => {
    blockTarget?.opener.focus();
    blockTarget = null;
});
blockDlg?.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t === blockDlg) { blockDlg.close(); return; }  // clic en el fondo
    if (t.closest('[data-bl-cancel]')) { blockDlg.close(); return; }
    const ok = t.closest<HTMLButtonElement>('[data-bl-confirm]');
    if (!ok || !blockTarget) return;
    const { host } = blockTarget;
    const uid = host.dataset.person!;
    const name = host.dataset.name || '';
    ok.disabled = true;
    const r = await call('block', uid);
    ok.disabled = false;
    if (!r.ok) { toast('No se ha podido bloquear. Inténtalo otra vez.', 'error'); return; }
    blockDlg.close();
    // En su perfil, se recarga con la cabecera reducida y «Desbloquear». En listas, la fila se va
    // (sin Deshacer: lo borrado no vuelve).
    if (host.closest('[data-pf-page]')) { location.reload(); return; }
    document.querySelectorAll<HTMLElement>(`.so-row[data-person="${CSS.escape(uid)}"]`).forEach((row) => row.remove());
    toast(`Has bloqueado a ${name}`);
    document.dispatchEvent(new CustomEvent('yf:relation', { detail: { uid, rel: r.relation, action: 'block' } }));
});

// -------------------------------------------------------------------------------------
// «Para pedir amistad, activa tu perfil» (handoff §6.6). El diálogo solo existe si NO tienes
// perfil activo. Al ir a activarlo se recuerda a quién querías pedírsela: al volver a esta misma
// página con el perfil ya activo, la solicitud sale sola.
// -------------------------------------------------------------------------------------
const noProfDlg = document.getElementById('so-noprof-dlg') as HTMLDialogElement | null;
const AFTER_KEY = 'yf_after_profile';
let noProfOpener: HTMLElement | null = null;

function openNoProfile(host: HTMLElement, opener: HTMLElement) {
    if (!noProfDlg) { toast('Para pedir amistad necesitas activar tu perfil público.', 'error'); return; }
    fillNames(noProfDlg, host.dataset.name || '');
    const here = location.pathname + location.search;
    const go = noProfDlg.querySelector<HTMLAnchorElement>('[data-np-go]');
    if (go) go.href = `/perfil/publico?next=${encodeURIComponent(here)}#direccion`;
    try {
        sessionStorage.setItem(AFTER_KEY, JSON.stringify({ uid: host.dataset.person, name: host.dataset.name, path: here, ts: Date.now() }));
    } catch { /* sin almacenamiento: tocará volver a pulsar */ }
    noProfOpener = opener;
    noProfDlg.showModal();
}
noProfDlg?.addEventListener('close', () => { noProfOpener?.focus(); noProfOpener = null; });
noProfDlg?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === noProfDlg || t.closest('[data-np-cancel]')) {
        try { sessionStorage.removeItem(AFTER_KEY); } catch { /* nada */ }
        noProfDlg.close();
    }
});

// Vuelta con el perfil ya activo: se envía la solicitud que quedó pendiente.
if (!noProfDlg) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(AFTER_KEY) || 'null') as { uid?: string; name?: string; path?: string; ts?: number } | null;
        if (saved?.uid && saved.path === location.pathname + location.search && Date.now() - (saved.ts ?? 0) < 60 * 60 * 1000) {
            sessionStorage.removeItem(AFTER_KEY);
            call('friend-request', saved.uid).then((r) => {
                if (r.ok && r.relation) {
                    repaintAll(saved.uid!, r.relation, 'friend-request');
                    toast(`Solicitud enviada a ${saved.name ?? ''}`.trim());
                }
            });
        }
    } catch { /* nada */ }
}

// -------------------------------------------------------------------------------------
// Menús de los botones («Amigos ▾», «Solicitud enviada ▾», «···»)
// -------------------------------------------------------------------------------------
function menuOf(toggle: Element): HTMLElement | null {
    return toggle.parentElement?.querySelector<HTMLElement>('.pf-menu') ?? null;
}
function closeMenus(except?: Element | null) {
    document.querySelectorAll<HTMLElement>('[data-menu-toggle][aria-expanded="true"]').forEach((t) => {
        if (t === except) return;
        t.setAttribute('aria-expanded', 'false');
        const m = menuOf(t);
        if (m) m.hidden = true;
    });
}
const menuItems = (m: HTMLElement) =>
    [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((el) => el.getAttribute('aria-disabled') !== 'true');

document.addEventListener('keydown', (e) => {
    const open = document.querySelector<HTMLElement>('[data-menu-toggle][aria-expanded="true"]');
    if (!open) return;
    const menu = menuOf(open);
    if (e.key === 'Escape') { closeMenus(); open.focus(); return; }
    if (!menu || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const items = menuItems(menu);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
});

// -------------------------------------------------------------------------------------
// Delegación
// -------------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
    const target = e.target as Element;

    const toggle = target.closest<HTMLElement>('[data-menu-toggle]');
    if (toggle) {
        e.preventDefault();
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        closeMenus(toggle);
        toggle.setAttribute('aria-expanded', String(open));
        const menu = menuOf(toggle);
        if (menu) {
            menu.hidden = !open;
            if (open) menuItems(menu)[0]?.focus();
        }
        return;
    }
    if (!target.closest('.pf-menu')) closeMenus();

    // «Ahora no» de la sugerencia de amistad: la descarta para siempre.
    const dismiss = target.closest<HTMLElement>('[data-sugg-dismiss]');
    if (dismiss) {
        dismiss.closest('.pf-sugg')?.remove();
        fetch('/api/social/referral/dismiss', { method: 'POST' }).catch(() => {});
        return;
    }

    const btn = target.closest<HTMLElement>('[data-sa]');
    if (!btn) return;
    const host = btn.closest<HTMLElement>('[data-person]');
    const action = btn.dataset.sa || '';
    if (!host) return;
    e.preventDefault();
    // Una acción desde un menú lo cierra; el foco vuelve a su botón.
    const fromMenu = btn.closest('.pf-menu-wrap')?.querySelector<HTMLElement>('[data-menu-toggle]') ?? null;
    if (fromMenu) closeMenus();

    if (action === 'block') { openBlock(host, fromMenu ?? btn); return; }
    if (action === 'friend-request' && noProfDlg) { openNoProfile(host, btn); return; }
    if (action === 'unblock' && host.closest('[data-pf-page]')) {
        // En el perfil, desbloquear vuelve a enseñarlo todo: se recarga.
        call('unblock', host.dataset.person!).then((r) => {
            if (r.ok) location.reload(); else toast('No se ha podido. Inténtalo otra vez.', 'error');
        });
        return;
    }
    if (ENDPOINT[action]) run(action, btn, host);
});

// -------------------------------------------------------------------------------------
// Puente para el ⌘K (CommandPalette.astro es un script en línea, sin módulos): pinta las filas
// del ámbito «Personas» con el mismo marcado y sigue desde el teclado (⌥↵) sin cerrar.
// -------------------------------------------------------------------------------------
declare global {
    interface Window {
        yfSocial?: {
            cmdkRowHtml(e: PersonEntry): string;
            follow(host: HTMLElement): boolean;
        };
    }
}
window.yfSocial = {
    cmdkRowHtml: (e) => personRowHtml(e.person, e.rel, {
        phase, avatarSize: 38, actions: 'cmdk',
        extra: '<span class="cmdk-enter" aria-hidden="true">↵</span>',
    }),
    follow(host) {
        const btn = host.querySelector<HTMLElement>('[data-sa="follow"]');
        if (!btn) return false;
        run('follow', btn, host);
        return true;
    },
};
