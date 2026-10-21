/**
 * Columna de conversaciones del panel de mensajes (`MessagesShell.astro`, handoff §3, §4.1 y §7).
 *
 *   · Escritorio: el panel ocupa lo que queda de pantalla bajo PersonalNav (mínimo 560 px).
 *   · Cada 30 s con la pestaña a la vista (y al volver a ella) se repinta la lista con el mismo
 *     marcado del servidor y se avisa del total a los contadores (`yf:msg-total`, bell.ts).
 *   · La conversación abierta pide un repintado en el acto con `yf:ms-list-refresh` (al enviar,
 *     al leer, al silenciar).
 *   · Avisos que vienen de otra página (`yf:ms-flash` en sessionStorage): «Has salido de «X»» o
 *     quién se quedó fuera al crear un grupo.
 */
import { railListHtml, unreadOf } from '../../../lib/social/chatView';
import { msgApi } from './api';
import { createPoller } from './poller';
import { showToast } from '../toast';

const shell = document.querySelector<HTMLElement>('[data-ms-shell]');
if (shell) init(shell);

function init(shell: HTMLElement) {
    const list = shell.querySelector<HTMLElement>('[data-ms-list]');

    try {
        const flash = sessionStorage.getItem('yf:ms-flash');
        if (flash) { sessionStorage.removeItem('yf:ms-flash'); showToast(flash); }
    } catch { /* sin almacenamiento */ }
    const active = Number(shell.dataset.active) || null;

    // ---- Altura del panel (escritorio) -------------------------------------------------
    const desk = window.matchMedia('(min-width: 1024px)');
    const fit = () => {
        if (!desk.matches) { shell.style.removeProperty('--ms-h'); return; }
        const top = shell.getBoundingClientRect().top + window.scrollY;
        shell.style.setProperty('--ms-h', `${Math.max(560, window.innerHeight - top - 32)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    desk.addEventListener('change', fit);

    // ---- Lista ----------------------------------------------------------------------------
    if (!list) return;
    const poller = createPoller(async () => {
        const r = await msgApi.list();
        if (!r.ok) return false;
        const convs = r.data.convs;
        // Sin cambios visibles no se toca el DOM (no se pierde el foco ni el hover).
        const html = railListHtml(convs, { active });
        if (html !== list.innerHTML) list.innerHTML = html;
        document.dispatchEvent(new CustomEvent('yf:msg-total', { detail: { total: unreadOf(convs, active) } }));
        return true;
    }, 30_000);
    poller.start();
    document.addEventListener('yf:ms-list-refresh', () => poller.now());
}
