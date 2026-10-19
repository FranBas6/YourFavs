/**
 * Acciones de relación en cualquier parte de la app (F2 de la capa social): seguir, dejar de
 * seguir, bloquear y desbloquear. Se carga en todas las páginas con sesión (`SocialLayer.astro`).
 *
 * Funciona por delegación: cualquier botón con `data-sa` dentro de un elemento con
 * `data-person="{uid}"` (fila de persona, aviso de la campana, cabecera del perfil, ⌘K). Al
 * pulsar:
 *   1. el botón cambia al momento (optimista) y queda `aria-busy`;
 *   2. se llama al endpoint, que devuelve la relación NUEVA;
 *   3. se repintan TODAS las piezas de esa persona en la página con `lib/social/ui.ts`, el mismo
 *      marcado que pinta el servidor;
 *   4. si falla, se deja como estaba y sale un toast.
 *
 * Avisa con `yf:relation` ({ uid, rel }) para que cada página haga lo suyo (quitar la fila de
 * «Bloqueados» al desbloquear…), y con `yf:notif-read` ({ id }) cuando actuar desde un aviso lo
 * da por leído.
 */
import { cmdkActionsHtml, firstName, followButtonHtml, notifZoneHtml, personRowHtml, rowActionsHtml } from '../../lib/social/ui';
import { SOCIAL_PHASE } from '../../utils/constants/social';
import type { PersonCard, PersonEntry, Relation } from '../../lib/social/types';

const phase = SOCIAL_PHASE;

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
    }, 2800);
}

/** Lo mínimo de la persona que necesitan los botones, leído de los data-* de su pieza. */
function personFrom(host: HTMLElement): PersonCard {
    const name = host.dataset.name || '';
    return {
        id: host.dataset.person || '',
        handle: host.dataset.handle || null,
        name,
        avatar: null, archetype: null, color: 'slate', initials: '',
    };
}

/** Repinta una pieza con la relación nueva, según su tipo (`data-rel-host`). */
function repaint(host: HTMLElement, rel: Relation) {
    const zone = host.querySelector<HTMLElement>('[data-rel-host]');
    if (!zone) return;
    const p = personFrom(host);
    const kind = zone.dataset.relHost;
    if (kind === 'row') {
        zone.innerHTML = rowActionsHtml(p, rel, { phase });
    } else if (kind === 'cmdk') {
        // El atajo ↵ de la fila resaltada se conserva.
        const enter = zone.querySelector('.cmdk-enter')?.outerHTML ?? '';
        zone.innerHTML = cmdkActionsHtml(p, rel, { phase }) + enter;
    } else if (kind === 'notif') {
        const mobile = !!host.closest('[data-notif-page]');
        zone.innerHTML = notifZoneHtml({ type: host.dataset.type || '', actor: p, rel }, { phase, mobile }).html;
    } else if (kind === 'profile') {
        // En la cabecera del perfil solo cambia el botón de seguir; el resto se queda.
        const old = zone.querySelector('[data-sa="follow"], [data-sa="unfollow"]');
        const html = followButtonHtml(p, rel, { phase, size: 'md' });
        if (old && html) old.outerHTML = html;
    }
}

function repaintAll(uid: string, rel: Relation) {
    document.querySelectorAll<HTMLElement>(`[data-person="${CSS.escape(uid)}"]`).forEach((h) => repaint(h, rel));
    document.dispatchEvent(new CustomEvent('yf:relation', { detail: { uid, rel } }));
}

/** Cambio optimista del botón pulsado, para que responda al instante. */
function optimistic(btn: HTMLElement, action: string) {
    btn.setAttribute('aria-busy', 'true');
    if (action === 'follow') {
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.remove('pri');
        const svg = btn.querySelector('svg')?.outerHTML ?? '';
        btn.innerHTML = `${svg}Siguiendo`;
    } else if (action === 'unfollow') {
        btn.setAttribute('aria-pressed', 'false');
    }
}

const ENDPOINT: Record<string, [string, 'POST' | 'DELETE']> = {
    follow: ['/api/social/follow', 'POST'],
    unfollow: ['/api/social/follow', 'DELETE'],
    block: ['/api/social/block', 'POST'],
    unblock: ['/api/social/block', 'DELETE'],
};

async function call(action: string, uid: string): Promise<{ ok: boolean; relation?: Relation; error?: string; status: number }> {
    const [url, method] = ENDPOINT[action];
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid }) });
        const data = await res.json().catch(() => ({}));
        return { ...data, ok: res.ok && data.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

function errorText(status: number, error: string | undefined, name: string): string {
    if (error === 'unavailable') return `Ahora mismo no se puede seguir a ${firstName(name)}.`;
    if (status === 429) return 'Vas muy rápido. Espera un momento y vuelve a probar.';
    return 'No se ha podido. Inténtalo otra vez.';
}

/** Marca leído el aviso desde el que se actuó (sin recargar la lista). */
function markNotifRead(host: HTMLElement) {
    if (!host.classList.contains('notif-item') || !host.classList.contains('is-unread')) return;
    host.classList.remove('is-unread');
    host.querySelector('.notif-dot')?.remove();
    const label = host.getAttribute('aria-label');
    if (label) host.setAttribute('aria-label', label.replace(/, sin leer$/, ''));
    const id = host.dataset.id;
    if (!id) return;
    fetch('/api/notifications', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'read', id }) }).catch(() => {});
    document.dispatchEvent(new CustomEvent('yf:notif-read', { detail: { id } }));
}

async function run(action: string, btn: HTMLElement, host: HTMLElement) {
    const uid = host.dataset.person;
    if (!uid || btn.getAttribute('aria-busy') === 'true') return;
    const before = btn.outerHTML;
    optimistic(btn, action);
    const r = await call(action, uid);
    if (!r.ok || !r.relation) {
        if (btn.isConnected) btn.outerHTML = before;
        toast(errorText(r.status, r.error, host.dataset.name || ''), 'error');
        return;
    }
    markNotifRead(host);
    repaintAll(uid, r.relation);
}

// -------------------------------------------------------------------------------------
// Bloquear: siempre con confirmación (diálogo de SocialLayer.astro)
// -------------------------------------------------------------------------------------
const dlg = document.getElementById('so-block-dlg') as HTMLDialogElement | null;
let blockTarget: { host: HTMLElement; opener: HTMLElement } | null = null;

function openBlock(host: HTMLElement, opener: HTMLElement) {
    if (!dlg) return;
    const name = host.dataset.name || '';
    dlg.querySelectorAll<HTMLElement>('[data-bl-name]').forEach((el) => { el.textContent = name; });
    dlg.querySelectorAll<HTMLElement>('[data-bl-first]').forEach((el) => { el.textContent = firstName(name); });
    blockTarget = { host, opener };
    dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-bl-cancel]')?.focus();
}

dlg?.addEventListener('close', () => {
    blockTarget?.opener.focus();
    blockTarget = null;
});
dlg?.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t === dlg) { dlg.close(); return; }  // clic en el fondo
    if (t.closest('[data-bl-cancel]')) { dlg.close(); return; }
    const ok = t.closest<HTMLButtonElement>('[data-bl-confirm]');
    if (!ok || !blockTarget) return;
    const { host } = blockTarget;
    const uid = host.dataset.person!;
    const name = host.dataset.name || '';
    ok.disabled = true;
    const r = await call('block', uid);
    ok.disabled = false;
    if (!r.ok) { toast('No se ha podido bloquear. Inténtalo otra vez.', 'error'); return; }
    dlg.close();
    // En su perfil, se recarga con la cabecera reducida y «Desbloquear». En listas, la fila se va.
    if (host.closest('[data-pf-page]')) { location.reload(); return; }
    document.querySelectorAll<HTMLElement>(`.so-row[data-person="${CSS.escape(uid)}"]`).forEach((row) => row.remove());
    toast(`Has bloqueado a ${name}`);
    document.dispatchEvent(new CustomEvent('yf:relation', { detail: { uid, rel: r.relation } }));
});

// -------------------------------------------------------------------------------------
// Delegación
// -------------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-sa]');
    if (!btn) return;
    const host = btn.closest<HTMLElement>('[data-person]');
    const action = btn.dataset.sa || '';
    if (!host) return;
    e.preventDefault();
    if (action === 'block') {
        // Cierra el menú «···» del que sale.
        const toggle = btn.closest('.pf-menu-wrap')?.querySelector<HTMLElement>('[data-menu-toggle]');
        if (toggle) { toggle.setAttribute('aria-expanded', 'false'); btn.closest<HTMLElement>('.pf-menu')!.hidden = true; }
        openBlock(host, toggle ?? btn);
        return;
    }
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
