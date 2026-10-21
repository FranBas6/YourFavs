/**
 * «Mensajes» en la cabecera (M3b): acceso rápido junto a la campana.
 *
 *   · Escritorio (≥ 1024 px): desplegable con las conversaciones recientes (las mismas filas que la
 *     columna de mensajes, `convRowHtml`), «Ver todos los mensajes» abajo. Se pide al abrirlo y,
 *     mientras está abierto, se repinta con cada aviso de tiempo real (`yf:live-msg`).
 *   · Móvil: el botón es un enlace normal a Mensajes (no hay sitio para el desplegable).
 *   · «Limpiar» (idea de Fran): vacía el desplegable y pone el contador a 0 hasta que llegue algo
 *     nuevo. NO es leer: nadie recibe un «Visto». La página de Mensajes las sigue enseñando todas.
 *
 * Se coordina con los demás desplegables de la cabecera (`window.yfHeaderPanels`). El número del
 * botón lo pinta `scripts/notifications/bell.ts` (`.js-msg-badge`).
 */
import { esc } from '../../../lib/social/ui';
import { railListHtml, unreadOf } from '../../../lib/social/chatView';
import { msgApi } from './api';

const btn = document.getElementById('msgs-toggle-btn');
const drop = document.getElementById('msgs-dropdown');
const list = document.getElementById('msgs-list');
const clearBtn = document.getElementById('msgs-clear') as HTMLButtonElement | null;

/** Cuántas conversaciones caben en el desplegable (el resto, en «Ver todos»). */
const MAX = 8;

if (btn && drop && list) {
    let isOpen = false;
    let seq = 0;
    // En una conversación, la abierta sale resaltada.
    const active = Number(document.querySelector<HTMLElement>('[data-ms-shell]')?.dataset.active) || null;

    const load = async () => {
        const mine = ++seq;
        if (!list.querySelector('.cv')) list.innerHTML = '<li class="notif-empty">Cargando…</li>';
        const r = await msgApi.list();
        if (mine !== seq) return;
        if (!r.ok) { list.innerHTML = '<li class="notif-empty">No se han podido cargar.</li>'; return; }
        const convs = r.data.convs;
        // Las limpiadas no salen hasta que llegue algo nuevo en ellas.
        const shown = convs.filter((c) => !c.cleared);
        list.innerHTML = shown.length
            ? railListHtml(shown.slice(0, MAX), { active })
            : convs.length
                ? '<li class="notif-empty">Nada nuevo por aquí.</li>'
                : `<li class="notif-empty">Aún no hay conversaciones.<br>Escribe a un amigo desde su perfil o su fila en ${esc('Amigos')}.</li>`;
        if (clearBtn) clearBtn.hidden = !shown.length;
        document.dispatchEvent(new CustomEvent('yf:msg-total', { detail: { total: unreadOf(convs, active) } }));
    };

    const setOpen = (v: boolean) => {
        isOpen = v;
        btn.setAttribute('aria-expanded', v ? 'true' : 'false');
        drop.style.display = v ? 'block' : 'none';
        if (v) void load();
    };

    const panel = { isOpen: () => isOpen, close: () => setOpen(false) };
    window.yfHeaderPanels?.push(panel);

    btn.addEventListener('click', (e) => {
        // Móvil: el enlace lleva a Mensajes.
        if (window.innerWidth < 1024) return;
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) window.yfClosePanels?.(panel);
        setOpen(!isOpen);
    });
    document.addEventListener('click', (e) => {
        const t = e.target as Node;
        if (isOpen && t.isConnected && !drop.contains(t) && !btn.contains(t)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) { setOpen(false); btn.focus(); }
    });
    // Tiempo real: abierto, se repinta con cada aviso de mensajes.
    document.addEventListener('yf:live-msg', () => { if (isOpen) void load(); });
    clearBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        clearBtn.disabled = true;
        const r = await msgApi.clear();
        clearBtn.disabled = false;
        if (!r.ok) return;
        seq++;
        list.innerHTML = '<li class="notif-empty">Nada nuevo por aquí.</li>';
        clearBtn.hidden = true;
        document.dispatchEvent(new CustomEvent('yf:msg-total', { detail: { total: 0 } }));
        // La columna de Mensajes (si está a la vista) quita la negrita.
        document.dispatchEvent(new CustomEvent('yf:ms-list-refresh'));
    });
    // Abrir una conversación cierra el desplegable (la página cambia igualmente).
    list.addEventListener('click', (e) => { if ((e.target as Element).closest('a.cv')) setOpen(false); });
}
