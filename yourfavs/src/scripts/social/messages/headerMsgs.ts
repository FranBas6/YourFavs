/**
 * «Mensajes» en la cabecera (M3b): acceso rápido junto a la campana.
 *
 *   · Escritorio (≥ 1024 px): desplegable con las conversaciones recientes (las mismas filas que la
 *     columna de mensajes, `convRowHtml`), «Ver todos los mensajes» abajo. Se pide al abrirlo y,
 *     mientras está abierto, se repinta con cada aviso de tiempo real (`yf:live-msg`).
 *   · Móvil: el botón es un enlace normal a Mensajes (no hay sitio para el desplegable).
 *   · «Limpiar» (idea de Fran): vacía el desplegable y pone el contador a 0 hasta que llegue algo
 *     nuevo. NO es leer: nadie recibe un «Visto». La página de Mensajes las sigue enseñando todas.
 *   · Mini-chat (M6, handoff M6 §2.5): con él en la página, la fila abre la conversación en la
 *     ventanita. La fila sigue siendo un enlace: Ctrl/Cmd/Mayús + clic, el botón central y el ⤢
 *     «Abrir en grande» de cada fila abren la página. La que está en la ventanita lo dice.
 *
 * Se coordina con los demás desplegables de la cabecera (`window.yfHeaderPanels`). El número del
 * botón lo pinta `scripts/notifications/bell.ts` (`.js-msg-badge`).
 */
import { esc, icon } from '../../../lib/social/ui';
import { railListHtml, unreadOf } from '../../../lib/social/chatView';
import { msgApi } from './api';
import type { ConvSummary } from '../../../lib/social/types';

const btn = document.getElementById('msgs-toggle-btn');
const drop = document.getElementById('msgs-dropdown');
const list = document.getElementById('msgs-list');
const clearBtn = document.getElementById('msgs-clear') as HTMLButtonElement | null;

/** Cuántas conversaciones caben en el desplegable (el resto, en «Ver todos»). */
const MAX = 8;
/** La línea de ayuda del mini-chat se deja de enseñar tras usarlo 3 veces (handoff M6, duda 1). */
const HINT_USES = 'yf:mw-uses';
const uses = () => { try { return Number(localStorage.getItem(HINT_USES)) || 0; } catch { return 0; } };

/** Mini-chat (M6): ⤢ en cada fila, «En la ventanita» en la suya y la línea de ayuda. */
function decorate(list: HTMLElement, drop: HTMLElement) {
    const mini = window.yfMiniChat;
    const on = Boolean(mini?.available());
    const inWin = on ? mini!.current() : null;
    list.querySelectorAll<HTMLAnchorElement>('a.cv').forEach((a) => {
        const li = a.parentElement;
        if (!on || !li) return;
        li.classList.add('cvw');
        li.insertAdjacentHTML('beforeend', `<a class="cv-big" href="${esc(a.getAttribute('href') ?? '')}" aria-label="Abrir en grande" title="Abrir en grande" data-cv-big>${icon('maximize-2')}</a>`);
        if (Number(a.dataset.conv) === inWin) {
            a.querySelector('.cv-t b')?.insertAdjacentHTML('afterend', `<span class="cv-inwin">${icon('message-circle')}En la ventanita</span>`);
            a.setAttribute('aria-label', `${a.getAttribute('aria-label') ?? ''}, en la ventanita`);
        }
    });
    let hint = drop.querySelector<HTMLElement>('.hm-hint');
    if (on && uses() < 3 && list.querySelector('a.cv')) {
        if (!hint) {
            drop.querySelector('.notif-footer')?.insertAdjacentHTML('beforebegin',
                `<p class="hm-hint">${icon('info')}<span>Se abren en una ventanita sin salir de aquí. <kbd>⤢</kbd> o <kbd>Ctrl</kbd>+clic para abrirlas en grande.</span></p>`);
        }
    } else hint?.remove();
}

if (btn && drop && list) {
    let isOpen = false;
    let seq = 0;
    // En una conversación, la abierta sale resaltada.
    const active = Number(document.querySelector<HTMLElement>('[data-ms-shell]')?.dataset.active) || null;

    let convs: ConvSummary[] = [];
    const load = async () => {
        const mine = ++seq;
        if (!list.querySelector('.cv')) list.innerHTML = '<li class="notif-empty">Cargando…</li>';
        const r = await msgApi.list();
        if (mine !== seq) return;
        if (!r.ok) { list.innerHTML = '<li class="notif-empty">No se han podido cargar.</li>'; return; }
        convs = r.data.convs;
        // Las limpiadas no salen hasta que llegue algo nuevo en ellas.
        const shown = convs.filter((c) => !c.cleared);
        list.innerHTML = shown.length
            ? railListHtml(shown.slice(0, MAX), { active })
            : convs.length
                ? '<li class="notif-empty">Nada nuevo por aquí.</li>'
                : `<li class="notif-empty">Aún no hay conversaciones.<br>Escribe a un amigo desde su perfil o su fila en ${esc('Amigos')}.</li>`;
        decorate(list, drop);
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
    // Abrir una conversación cierra el desplegable. Con el mini-chat, la fila la abre en la ventanita
    // (salvo con Ctrl/Cmd/Mayús, que abren la página como cualquier enlace); el ⤢, en grande.
    list.addEventListener('click', (e) => {
        const t = e.target as Element;
        const big = t.closest<HTMLAnchorElement>('[data-cv-big]');
        if (big) {
            const id = Number(big.previousElementSibling?.getAttribute('data-conv'));
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && window.yfMiniChat?.current() === id) window.yfMiniChat.close();
            setOpen(false);
            return;
        }
        const a = t.closest<HTMLAnchorElement>('a.cv');
        if (!a) return;
        setOpen(false);
        const mini = window.yfMiniChat;
        if (!mini?.available() || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const id = Number(a.dataset.conv);
        mini.open(id, convs.find((c) => c.id === id));
        try { localStorage.setItem(HINT_USES, String(uses() + 1)); } catch { /* sin almacenamiento */ }
    });
}
