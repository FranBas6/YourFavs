/**
 * El mini-chat de escritorio (Mensajes M6; handoff docs/Mensajes/design_handoff_m6).
 *
 *   · Una sola ventanita abajo a la derecha (≥ 1024 px). Se abre desde el desplegable «Mensajes» de
 *     la cabecera (`window.yfMiniChat.open`). Dentro, la conversación de siempre: `mountChat` de
 *     chat.ts sobre el marcado de `lib/social/miniChatView.ts`, en talla compacta.
 *   · Minimizar ≠ cerrar: minimizada se queda abajo como una barra (con «Nuevos» y el número) y
 *     vuelve en cada página; cerrada no vuelve.
 *   · La web recarga al navegar: el estado va en `localStorage` (`yf:mw`, 12 h) y lo pintado en
 *     `sessionStorage` (`yf:mw-cache:{id}`), que el script en línea de MiniChat.astro vuelve a poner
 *     ANTES del primer pintado, sin animación y sin mover el foco. Esto lo actualiza después.
 *   · Los mensajes nuevos no abren nada. Leído, solo con la ventanita abierta y la pestaña a la vista.
 *   · Tamaño (idea de Fran, fuera del handoff): 420 × 620 por defecto y ajustable con el asa de la
 *     esquina de arriba a la izquierda, de 360 × 480 a 640 de ancho y la pantalla de alto. Se guarda en
 *     `yf:mw-size` y va en <html> como --mw-w / --mw-h (el script en línea lo pone antes de pintar).
 */
import { mountChat, type MountedChat } from './chat';
import { msgApi } from './api';
import { createPoller } from './poller';
import { showToast } from '../toast';
import {
    headOfChat, headOfConv, miniBarHtml, miniGoneHtml, miniLoadingHtml, miniMenuHtml, miniWindowHtml, type MiniHead,
} from '../../../lib/social/miniChatView';
import type { ConvSummary } from '../../../lib/social/types';

type MiniState = { uid: string; convId: number; state: 'open' | 'min' | 'closed'; at: number };
interface MiniCache { head: MiniHead; mw?: string; mwm?: string; unread?: number }

declare global {
    interface Window {
        yfMiniChat?: {
            /** ¿Hay mini-chat en esta página y pantalla? (si no, la fila del desplegable navega). */
            available(): boolean;
            /** `conv`: su fila de la lista, para pintar la cabecera mientras carga. */
            open(id: number, conv?: ConvSummary): void;
            /** La conversación que está en la ventanita (abierta o minimizada), o null. */
            current(): number | null;
            /** Cerrarla (p. ej. al abrir esa conversación en grande). */
            close(): void;
        };
    }
}

const KEY = 'yf:mw';
const TTL = 12 * 3600_000;
const cacheKey = (id: number) => `yf:mw-cache:${id}`;
const MAX_CACHE = 400_000; // caracteres: más, no se guarda (se pinta con las barras grises)
const SIZE_KEY = 'yf:mw-size';
const SIZE = { w: 420, h: 620, minW: 360, minH: 480, maxW: 640, step: 20 };

const store = {
    get(s: Storage, k: string): string | null { try { return s.getItem(k); } catch { return null; } },
    set(s: Storage, k: string, v: string | null) { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* lleno o sin almacenamiento */ } },
};

const root = document.getElementById('mw-root');
if (root) init(root);

function init(root: HTMLElement) {
    const uid = root.dataset.uid ?? '';
    const desktop = window.matchMedia('(min-width: 1024px)');

    const readState = (): MiniState | null => {
        try {
            const s = JSON.parse(store.get(localStorage, KEY) || 'null') as MiniState | null;
            if (!s || s.uid !== uid || !s.convId || Date.now() - s.at > TTL) return null;
            return s;
        } catch { return null; }
    };
    let st: MiniState | null = readState();
    const save = (convId: number, state: MiniState['state']) => {
        st = { uid, convId, state, at: Date.now() };
        store.set(localStorage, KEY, JSON.stringify(st));
    };
    const readCache = (id: number): MiniCache | null => {
        try { return JSON.parse(store.get(sessionStorage, cacheKey(id)) || 'null'); } catch { return null; }
    };

    let head: MiniHead | null = st ? readCache(st.convId)?.head ?? null : null;
    let mounted: MountedChat | null = null;
    let unread = st ? readCache(st.convId)?.unread ?? 0 : 0;
    let seq = 0;

    const setBody = () => {
        const s = st?.state;
        document.body.classList.toggle('has-mw', !root.hidden && s === 'open');
        document.body.classList.toggle('has-mw-min', !root.hidden && s === 'min');
    };
    const unmount = () => { mounted?.destroy(); mounted = null; };
    const win = () => root.querySelector<HTMLElement>('[data-mw-win]');
    // Sin nada guardado ni fila de la lista: cabecera vacía hasta que llegue la conversación.
    const placeholderHead = (id: number): MiniHead => ({ id, group: false, title: '', sub: '', faces: [], muted: false });

    // ---- Abrir ------------------------------------------------------------------------------
    async function open(id: number, o: { focus: boolean; animate: boolean; quiet?: boolean; conv?: ConvSummary }) {
        const mine = ++seq;
        unmount();
        minPoller.stop();
        save(id, 'open');
        if (head?.id !== id) head = readCache(id)?.head ?? (o.conv ? headOfConv(o.conv) : null);
        // Lo que ya hay pintado de esta conversación (la caché del script en línea) se queda hasta
        // que llegue lo nuevo; si no, barras grises.
        const painted = win();
        if (!painted || Number(painted.dataset.conv) !== id || !painted.querySelector('[data-ms-log]')) {
            root.innerHTML = miniLoadingHtml(head ?? placeholderHead(id));
            if (o.animate) win()?.classList.add('is-enter');
        }
        root.hidden = false;
        setBody();
        // «Actualizando»: solo si tarda más de 300 ms.
        const prog = window.setTimeout(() => {
            const h = root.querySelector('.mw-h');
            if (h && !h.querySelector('.mw-prog')) h.insertAdjacentHTML('beforeend', '<span class="mw-prog" role="progressbar" aria-label="Actualizando"></span>');
        }, 300);
        const r = await msgApi.chat(id);
        window.clearTimeout(prog);
        if (mine !== seq) return;
        if (!r.ok) {
            const why = r.status === 404 ? ((r.data as { error?: string }).error === 'left' ? 'left' : 'none') : 'error';
            // Al reabrirse sola (otra cuenta, o ya no está): sin ruido, se cierra.
            if (o.quiet && why !== 'error') { close(false); return; }
            gone(why);
            return;
        }
        const chat = r.data.chat;
        head = headOfChat(chat);
        // Lo que se estuviera escribiendo en lo pintado de la caché no se pierde.
        const oldTa = root.querySelector<HTMLTextAreaElement>('[data-ms-input]');
        const typing = oldTa && document.activeElement === oldTa;
        if (oldTa?.value) store.set(sessionStorage, `yf:chat-draft:${id}`, oldTa.value);
        const animate = o.animate && !win()?.classList.contains('is-enter');
        root.innerHTML = miniWindowHtml(chat);
        const w = win()!;
        if (animate) w.classList.add('is-enter');
        mounted = mountChat(w, chat, {
            compact: true,
            canRead: () => st?.state === 'open' && desktop.matches && !root.hidden,
            onGone: (why) => gone(why),
            onRemount: () => void open(id, { focus: false, animate: false }),
            onLeft: (title) => { close(false); showToast(`Has salido de «${title}»`); },
        });
        unread = 0;
        if (o.focus || typing) mounted.focusInput();
    }

    function gone(why: 'left' | 'none' | 'error') {
        unmount();
        if (!st) return;
        root.innerHTML = miniGoneHtml(head ?? placeholderHead(st.convId), why);
        root.hidden = false;
        // Ya no se puede ver: al cambiar de página, no vuelve.
        if (why !== 'error') save(st.convId, 'closed');
        setBody();
    }

    // ---- Minimizar y cerrar --------------------------------------------------------------------
    function paintBar() {
        if (!st || !head) return;
        root.innerHTML = miniBarHtml(head, unread);
        root.hidden = false;
        setBody();
    }
    function minimize(focusBar: boolean) {
        if (!st) return;
        seq++;
        unmount();
        save(st.convId, 'min');
        if (!head) head = placeholderHead(st.convId);
        paintBar();
        minPoller.start();
        void refreshUnread();
        if (focusBar) root.querySelector<HTMLElement>('[data-mw-open]')?.focus();
    }
    function close(focusHeader = true) {
        seq++;
        unmount();
        minPoller.stop();
        if (st) save(st.convId, 'closed');
        root.innerHTML = '';
        root.hidden = true;
        setBody();
        if (focusHeader) document.getElementById('msgs-toggle-btn')?.focus();
    }

    // Minimizada: el número sale de la lista de conversaciones (al llegar algo y cada 30 s).
    async function refreshUnread() {
        if (st?.state !== 'min') return true;
        const r = await msgApi.list();
        if (!r.ok) return false;
        const c = r.data.convs.find((x) => x.id === st?.convId);
        if (!c) return true;
        const fresh = headOfConv(c);
        // La cabecera guardada (con el subtítulo completo) vale más que la de la lista.
        head = head && head.id === c.id && head.title ? { ...head, muted: c.muted, title: c.title } : fresh;
        if (c.unread !== unread || !root.querySelector('[data-mw-bar]')) { unread = c.unread; paintBar(); }
        return true;
    }
    const minPoller = createPoller(refreshUnread, 30_000);
    document.addEventListener('yf:live-msg', (e) => {
        const ids = (e as CustomEvent<{ convs: number[] }>).detail?.convs ?? [];
        if (st?.state === 'min' && (!ids.length || ids.includes(st.convId))) void refreshUnread();
    });

    // ---- Menú «···» -------------------------------------------------------------------------------
    const menuEl = () => root.querySelector<HTMLElement>('[data-mw-menu]');
    const moreBtn = () => root.querySelector<HTMLElement>('[data-mw-more]');
    function closeMenu(focusBtn = false) {
        const m = menuEl();
        if (!m || m.hidden) return;
        m.hidden = true;
        moreBtn()?.setAttribute('aria-expanded', 'false');
        if (focusBtn) moreBtn()?.focus();
    }
    function openMenu() {
        const m = menuEl();
        if (!m || !head) return;
        m.innerHTML = miniMenuHtml(head, mounted?.isMuted() ?? head.muted);
        m.hidden = false;
        moreBtn()?.setAttribute('aria-expanded', 'true');
        m.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }

    // ---- Tamaño (asa de la esquina) --------------------------------------------------------------
    const html = document.documentElement;
    const clampSize = (w: number, h: number) => ({
        w: Math.round(Math.max(SIZE.minW, Math.min(w, SIZE.maxW, window.innerWidth - 48))),
        h: Math.round(Math.max(SIZE.minH, Math.min(h, window.innerHeight - 96))),
    });
    const curSize = () => {
        const r = win()?.getBoundingClientRect();
        return { w: r?.width ?? SIZE.w, h: r?.height ?? SIZE.h };
    };
    function setSize(w: number, h: number, persist: boolean) {
        const c = clampSize(w, h);
        html.style.setProperty('--mw-w', `${c.w}px`);
        html.style.setProperty('--mw-h', `${c.h}px`);
        if (persist) store.set(localStorage, SIZE_KEY, JSON.stringify(c));
    }
    function resetSize() {
        html.style.removeProperty('--mw-w');
        html.style.removeProperty('--mw-h');
        store.set(localStorage, SIZE_KEY, null);
    }
    // Lo guardado (el script en línea ya lo puso; aquí, por si no hubo caché que pintar).
    try {
        const saved = JSON.parse(store.get(localStorage, SIZE_KEY) || 'null') as { w: number; h: number } | null;
        if (saved?.w && saved?.h) setSize(saved.w, saved.h, false);
    } catch { /* sin tamaño guardado */ }

    let drag: { x: number; y: number; w: number; h: number; id: number } | null = null;
    root.addEventListener('pointerdown', (e) => {
        const handle = (e.target as Element).closest<HTMLElement>('[data-mw-resize]');
        if (!handle || e.button !== 0) return;
        e.preventDefault();
        const s = curSize();
        drag = { x: e.clientX, y: e.clientY, w: s.w, h: s.h, id: e.pointerId };
        handle.setPointerCapture(e.pointerId);
        html.classList.add('mw-resizing');
    });
    root.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        // La ventanita está anclada abajo a la derecha: hacia la izquierda y hacia arriba, crece.
        setSize(drag.w + (drag.x - e.clientX), drag.h + (drag.y - e.clientY), false);
    });
    const endDrag = (e: PointerEvent) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        html.classList.remove('mw-resizing');
        const s = curSize();
        setSize(s.w, s.h, true);
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    root.addEventListener('dblclick', (e) => { if ((e.target as Element).closest('[data-mw-resize]')) resetSize(); });
    // Con la pantalla más pequeña que lo guardado, el CSS ya lo recorta (min con 100vw / 100vh).

    // ---- Eventos -----------------------------------------------------------------------------------
    root.addEventListener('click', (e) => {
        const t = e.target as Element;
        if (t.closest('[data-mw-min]')) { minimize(true); return; }
        if (t.closest('[data-mw-close]')) { e.preventDefault(); close(); return; }
        if (t.closest('[data-mw-open]')) { if (st) void open(st.convId, { focus: true, animate: true }); return; }
        if (t.closest('[data-mw-retry]')) { if (st) void open(st.convId, { focus: false, animate: false }); return; }
        const big = t.closest<HTMLAnchorElement>('[data-mw-big]');
        if (big) {
            // En grande: que no se abra encima de la página de la conversación al volver. Con Ctrl/Cmd
            // (otra pestaña) la ventanita se queda.
            const me = e as MouseEvent;
            if (!me.ctrlKey && !me.metaKey && !me.shiftKey && me.button === 0 && st) { unmount(); save(st.convId, 'closed'); }
            return;
        }
        if (t.closest('[data-mw-more]')) { if (menuEl()?.hidden === false) closeMenu(); else openMenu(); return; }
        if (t.closest('[data-mw-mute]')) {
            closeMenu(true);
            if (mounted && head) { const next = !mounted.isMuted(); void mounted.setMuted(next).then(() => { if (head) head.muted = mounted?.isMuted() ?? next; }); }
            return;
        }
        if (t.closest('[data-mw-leave]')) { closeMenu(); void mounted?.leave(); }
    });
    document.addEventListener('click', (e) => {
        const m = menuEl();
        if (m && !m.hidden && !m.contains(e.target as Node) && !moreBtn()?.contains(e.target as Node)) closeMenu();
    });
    root.addEventListener('keydown', (e) => {
        // El asa con el teclado: ←/↑ crece, →/↓ encoge; Enter o Espacio, tamaño normal.
        if ((e.target as Element).closest('[data-mw-resize]')) {
            const s = curSize();
            const d: Record<string, [number, number]> = { ArrowLeft: [SIZE.step, 0], ArrowRight: [-SIZE.step, 0], ArrowUp: [0, SIZE.step], ArrowDown: [0, -SIZE.step] };
            if (d[e.key]) { e.preventDefault(); setSize(s.w + d[e.key][0], s.h + d[e.key][1], true); return; }
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetSize(); return; }
        }
        const m = menuEl();
        if (m && !m.hidden && m.contains(e.target as Node)) {
            const items = [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')];
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
            else if (e.key === 'Tab') closeMenu();
            return;
        }
        // Escape: si nada está abierto (el ＋ y el menú de un mensaje lo atienden ellos), minimiza.
        if (e.key !== 'Escape' || e.defaultPrevented || st?.state !== 'open') return;
        if ((e.target as Element).closest('.mm[tabindex]')) return; // en una línea: vuelve al registro
        e.preventDefault();
        minimize(true);
    });

    // Al cambiar de página: lo pintado, para volver a ponerlo antes del primer pintado.
    window.addEventListener('pagehide', () => {
        if (!st || st.state === 'closed' || !head) return;
        const entry: MiniCache = { head, unread };
        const w = win();
        if (st.state === 'open' && w?.querySelector('[data-ms-log]')) {
            const c = w.cloneNode(true) as HTMLElement;
            c.classList.remove('is-enter');
            c.querySelectorAll('.mw-prog').forEach((x) => x.remove());
            c.querySelectorAll<HTMLElement>('#ms-pm, [data-ms-menu], [data-mw-menu]').forEach((x) => { x.hidden = true; });
            c.querySelector('[data-ms-plus]')?.setAttribute('aria-expanded', 'false');
            c.querySelector('[data-ms-plus]')?.classList.remove('open');
            c.querySelector('[data-mw-more]')?.setAttribute('aria-expanded', 'false');
            if (c.outerHTML.length <= MAX_CACHE) entry.mw = c.outerHTML;
        }
        const bar = root.querySelector('[data-mw-bar]');
        if (bar) entry.mwm = bar.outerHTML;
        store.set(sessionStorage, cacheKey(st.convId), JSON.stringify(entry));
    });

    // Al ensanchar la pantalla: lo que llegó mientras estaba oculta se marca como leído.
    desktop.addEventListener('change', () => {
        if (!desktop.matches) return;
        if (mounted) mounted.refresh();
        else if (st && st.state !== 'closed' && !win() && !root.querySelector('[data-mw-bar]')) hydrate();
    });

    window.yfMiniChat = {
        available: () => desktop.matches,
        open: (id, conv) => void open(id, { focus: true, animate: !(st?.state === 'open' && st.convId === id), conv }),
        current: () => (st && st.state !== 'closed' && !root.hidden ? st.convId : null),
        close: () => close(false),
    };

    // ---- Arranque: lo que había al cambiar de página -------------------------------------------
    function hydrate() {
        if (!st || st.state === 'closed') return;
        if (st.state === 'open') void open(st.convId, { focus: false, animate: false, quiet: true });
        else {
            save(st.convId, 'min');
            if (!head) head = placeholderHead(st.convId);
            if (!root.querySelector('[data-mw-bar]')) paintBar();
            minPoller.start();
            void refreshUnread();
        }
    }
    if (desktop.matches) hydrate();
}
