/**
 * Una conversación abierta (`/mislistas/amigos/mensajes/{id}`, handoff de mensajes §4 y §9).
 *
 * El servidor ya pintó cabecera, mensajes y panel. Esto:
 *   · envía de forma optimista («Enviando…» → mensaje; si falla, «No se ha enviado · Reintentar»,
 *     guardado en `yf:chat-failed:{id}`; el reintento usa el mismo `clientId`, así que nunca duplica);
 *   · sondea cada 5 s con la pestaña a la vista (nuevos, borrados, «Visto») y marca como leído;
 *   · carga 50 más al subir, sin saltar;
 *   · menú de cada mensaje (escritorio: «···»; móvil: pulsación larga → hoja), copiar, borrar con
 *     Deshacer (6 s), reportar, «Mostrar» un plegado;
 *   · panel de información (plegable en escritorio, hoja en móvil) y Silenciar;
 *   · compositor: crece hasta 6 líneas, Enter envía en escritorio, contador desde 1.800, borrador
 *     en sessionStorage; en móvil pegado al teclado (visualViewport).
 *
 * Todo el marcado sale de `lib/social/chatView.ts` (el mismo del servidor). El registro se repinta
 * entero; por eso los nuevos de otras personas se anuncian en una región aparte (`data-ms-live`).
 */
import { MSG_MAX, chatSubtitle, hm, infoHtml, logHtml, newAnchor, num, type PendingMsg } from '../../../lib/social/chatView';
import { DELETED_ACCOUNT, FOLDED_TEXT } from '../../../lib/social/messagesText';
import { avatarHtml, esc, firstName, icon } from '../../../lib/social/ui';
import { msgApi } from './api';
import { createPoller } from './poller';
import { showToast } from '../toast';
import type { ChatMessage, ChatView } from '../../../lib/social/types';

/** uuid v4 (crypto.randomUUID solo existe en contextos seguros). */
function uuid(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const store = {
    get(s: Storage, k: string): string | null { try { return s.getItem(k); } catch { return null; } },
    set(s: Storage, k: string, v: string | null) { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

function init(root: HTMLElement, chat: ChatView) {
    const conv = chat.id;
    const me = chat.me.id;
    const group = chat.kind === 'group';
    const shell = root.closest<HTMLElement>('[data-ms-shell]');
    const scroller = root.querySelector<HTMLElement>('[data-ms-log-scroll]')!;
    const logEl = root.querySelector<HTMLElement>('[data-ms-log]')!;
    const olderEl = root.querySelector<HTMLElement>('[data-ms-older]')!;
    const live = root.querySelector<HTMLElement>('[data-ms-live]')!;
    const menu = root.querySelector<HTMLElement>('[data-ms-menu]')!;
    const form = root.querySelector<HTMLFormElement>('[data-ms-form]');
    const input = root.querySelector<HTMLTextAreaElement>('[data-ms-input]');
    const sendBtn = root.querySelector<HTMLButtonElement>('[data-ms-send]');
    const countEl = root.querySelector<HTMLElement>('[data-ms-count]');
    const countLive = root.querySelector<HTMLElement>('[data-ms-count-live]');
    const actSheet = document.getElementById('ms-act-sheet') as HTMLDialogElement | null;
    const infoSheet = document.getElementById('ms-info-sheet') as HTMLDialogElement | null;
    const reportDlg = document.getElementById('ms-report') as HTMLDialogElement | null;
    const mobile = window.matchMedia('(max-width: 1023.98px)');

    // ---- Estado ----------------------------------------------------------------------------
    let msgs: ChatMessage[] = chat.messages;
    const people = { ...chat.people };
    let seenId = chat.seenId;
    let seenAt = chat.seenAt;
    let hasMore = chat.hasMore;
    let muted = chat.me.muted;
    // «Nuevos»: encima del primero sin leer AL ABRIR (si lo había) y hasta salir.
    const newAfter = newAnchor(msgs, me, chat.me.lastReadId);
    let readSent = chat.me.lastReadId ?? 0;
    const revealed: Record<number, string> = {};
    const FAILED_KEY = `yf:chat-failed:${conv}`;
    const DRAFT_KEY = `yf:chat-draft:${conv}`;
    // Lo que quedó sin enviar (también lo que se estaba enviando al cerrar): todo como «no enviado».
    let pending: PendingMsg[] = (() => {
        try {
            const arr = JSON.parse(store.get(localStorage, FAILED_KEY) || '[]') as PendingMsg[];
            return Array.isArray(arr) ? arr.filter((p) => p && typeof p.body === 'string').map((p) => ({ ...p, failed: true })) : [];
        } catch { return []; }
    })();
    const saveFailed = () => store.set(localStorage, FAILED_KEY, pending.length ? JSON.stringify(pending) : null);

    const lastId = () => (msgs.length ? msgs[msgs.length - 1].id : 0);
    const firstId = () => (msgs.length ? msgs[0].id : 0);
    const find = (id: number) => msgs.find((m) => m.id === id);
    const nameOf = (id: string | null) => (id && people[id]?.name) || DELETED_ACCOUNT;
    const refreshList = () => document.dispatchEvent(new CustomEvent('yf:ms-list-refresh'));

    // ---- Pintar ------------------------------------------------------------------------------
    let menuFor: number | null = null;
    let dirty = false;
    function render(mode: 'keep' | 'bottom' | 'prepend' = 'keep') {
        // Con un menú abierto no se repinta debajo de él: se hace al cerrarlo.
        if (menuFor !== null) { dirty = true; return; }
        dirty = false;
        const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
        const fromBottom = scroller.scrollHeight - scroller.scrollTop;
        const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('[data-mid]');
        const focusedId = focused && logEl.contains(focused) ? focused.dataset.mid : null;
        logEl.innerHTML = logHtml(msgs, {
            me, group, people, newAfter, seenId, seenAt, pending, revealed, compact: mobile.matches,
        });
        if (mode === 'bottom' || (mode === 'keep' && atBottom)) scroller.scrollTop = scroller.scrollHeight;
        else if (mode === 'prepend') scroller.scrollTop = scroller.scrollHeight - fromBottom;
        if (focusedId) logEl.querySelector<HTMLElement>(`[data-mid="${focusedId}"]`)?.focus({ preventScroll: true });
    }

    function announce(fresh: ChatMessage[]) {
        const lines = fresh
            .filter((m) => m.author !== me && m.kind === 'text' && !m.deleted)
            .map((m) => `${nameOf(m.author)}: ${m.folded ? FOLDED_TEXT : m.body ?? ''}`);
        if (lines.length) live.textContent = lines.join('. ');
    }

    /** Añade los que no estaban (y quita los pendientes que ya llegaron). Devuelve los nuevos. */
    function merge(incoming: ChatMessage[]): ChatMessage[] {
        const known = new Set(msgs.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (!fresh.length) return fresh;
        const arrived = new Set(fresh.map((m) => m.clientId).filter(Boolean));
        if (arrived.size) { pending = pending.filter((p) => !arrived.has(p.clientId)); saveFailed(); }
        msgs = [...msgs, ...fresh].sort((a, b) => a.id - b.id);
        return fresh;
    }

    // ---- Leído -----------------------------------------------------------------------------
    async function markRead() {
        const last = lastId();
        if (!last || last <= readSent || document.visibilityState !== 'visible') return;
        readSent = last;
        const r = await msgApi.read(conv, last);
        if (r.ok) refreshList();
    }

    // ---- Sondeo (5 s) ------------------------------------------------------------------------
    const poller = createPoller(async () => {
        const last = lastId();
        const r = await msgApi.chat(conv, last ? { after: last, from: firstId() } : {});
        // Ya no estás (te quitaron, o el 1:1 dejó de estar en tu lista): la página lo explica.
        if (r.status === 404) { location.reload(); return true; }
        if (!r.ok) return false;
        const c = r.data.chat;
        Object.assign(people, c.people);
        const fresh = merge(c.messages);
        let changed = fresh.length > 0;
        for (const id of c.deletedIds) {
            const m = find(id);
            if (m && !m.deleted) { m.deleted = true; m.body = null; changed = true; }
        }
        if (c.seenId !== seenId || c.seenAt !== seenAt) { seenId = c.seenId; seenAt = c.seenAt; changed = true; }
        // Se ha abierto o cerrado la escritura (amistad): la página pinta el compositor que toca.
        if (c.readOnly !== chat.readOnly) { location.reload(); return true; }
        // Cambios del grupo (nombre, personas): cabecera y panel.
        if (fresh.some((m) => m.kind === 'system')) repaintMeta(c);
        if (changed) render();
        announce(fresh);
        if (fresh.some((m) => m.author !== me)) void markRead();
        return true;
    }, 5000);

    function repaintMeta(c: ChatView) {
        const t = root.querySelector('[data-ms-title]');
        const s = root.querySelector('[data-ms-sub]');
        if (t) t.textContent = c.title;
        if (s) s.textContent = chatSubtitle(c);
        const html = infoHtml({ ...c, me: { ...c.me, muted } });
        const aside = document.getElementById('ms-info');
        if (aside) aside.innerHTML = html;
        const sheetIn = infoSheet?.querySelector('.ms-info-in');
        if (sheetIn) sheetIn.innerHTML = html;
    }

    // ---- Cargar anteriores -------------------------------------------------------------------
    let loadingOlder = false;
    async function loadOlder() {
        if (loadingOlder || !hasMore || !msgs.length) return;
        loadingOlder = true;
        olderEl.hidden = false;
        const r = await msgApi.chat(conv, { before: firstId() });
        olderEl.hidden = true;
        loadingOlder = false;
        if (!r.ok) return;
        Object.assign(people, r.data.chat.people);
        const known = new Set(msgs.map((m) => m.id));
        msgs = [...r.data.chat.messages.filter((m) => !known.has(m.id)), ...msgs];
        hasMore = r.data.chat.hasMore;
        render('prepend');
    }
    scroller.addEventListener('scroll', () => { if (scroller.scrollTop < 80) void loadOlder(); }, { passive: true });

    // ---- Enviar ------------------------------------------------------------------------------
    async function send(p: PendingMsg) {
        p.failed = false;
        if (!pending.includes(p)) pending.push(p);
        saveFailed();
        render('bottom');
        const r = await msgApi.send(conv, p.body, p.clientId);
        if (r.ok) {
            pending = pending.filter((x) => x !== p);
            saveFailed();
            merge([r.data.message]);
            readSent = Math.max(readSent, r.data.message.id);
            render('bottom');
            refreshList();
            return;
        }
        if (r.data.error === 'read_only' || r.status === 404) {
            pending = pending.filter((x) => x !== p);
            saveFailed();
            location.reload();
            return;
        }
        p.failed = true;
        saveFailed();
        render();
        if (r.status === 429) showToast('Vas muy rápido. Espera un momento.', 'error');
    }

    // ---- Compositor ----------------------------------------------------------------------------
    if (form && input && sendBtn) {
        let announced = 0;
        const autosize = () => {
            input.style.height = 'auto';
            input.style.height = `${input.scrollHeight}px`;
        };
        const updateCount = () => {
            const n = input.value.length;
            if (!countEl || !countLive) return;
            if (n < 1800) { countEl.hidden = true; announced = 0; return; }
            const full = n >= MSG_MAX;
            countEl.hidden = false;
            countEl.classList.toggle('lim', full);
            countEl.textContent = full ? `${num(MSG_MAX)}/${num(MSG_MAX)} · no caben más` : `Quedan ${MSG_MAX - n} · ${num(n)}/${num(MSG_MAX)}`;
            // Se anuncia solo al cruzar 1.900, 1.950 y 2.000.
            const step = [2000, 1950, 1900].find((s) => n >= s) ?? 0;
            if (step && step !== announced) {
                countLive.textContent = full ? 'Has llegado a 2.000 caracteres. No caben más.' : `Quedan ${MSG_MAX - n} caracteres.`;
            }
            announced = step;
        };
        const sync = () => {
            autosize();
            updateCount();
            sendBtn.disabled = !input.value.trim();
            store.set(sessionStorage, DRAFT_KEY, input.value || null);
        };
        const submit = () => {
            const body = input.value.trim();
            if (!body || body.length > MSG_MAX) return;
            input.value = '';
            sync();
            input.focus();
            void send({ clientId: uuid(), body, at: Date.now(), failed: false });
        };

        input.value = store.get(sessionStorage, DRAFT_KEY) ?? '';
        sync();
        input.addEventListener('input', sync);
        input.addEventListener('keydown', (e) => {
            // Escritorio: Enter envía y Mayús + Enter hace otra línea. Móvil: Enter es salto de línea.
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !mobile.matches) {
                e.preventDefault();
                submit();
            }
        });
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
        // Que pulsar Enviar no quite el foco al campo (en móvil cerraría el teclado).
        sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
        root.querySelector('.ms-plus')?.addEventListener('click', (e) => e.preventDefault());
    }

    // ---- Acciones sobre un mensaje ----------------------------------------------------------
    const bodyOf = (m: ChatMessage) => (m.folded ? revealed[m.id] ?? '' : m.body ?? '');

    async function copy(id: number) {
        const m = find(id);
        if (!m) return;
        try { await navigator.clipboard.writeText(bodyOf(m)); showToast('Texto copiado'); }
        catch { showToast('No se ha podido copiar', 'error'); }
    }

    async function remove(id: number) {
        const m = find(id);
        if (!m || m.author !== me || m.deleted) return;
        const body = m.body ?? '';
        m.deleted = true;
        m.body = null;
        render();
        const r = await msgApi.remove(conv, id);
        if (!r.ok) {
            m.deleted = false;
            m.body = body;
            render();
            showToast('No se ha podido borrar. Inténtalo otra vez.', 'error');
            return;
        }
        refreshList();
        showToast('Mensaje eliminado', 'success', async () => {
            const u = await msgApi.restore(conv, id, body);
            if (u.ok) { m.deleted = false; m.body = body; render(); refreshList(); }
            else showToast('Ya no se puede deshacer', 'error');
        });
    }

    async function reveal(id: number) {
        const r = await msgApi.folded(conv, id);
        if (!r.ok) { showToast('No se ha podido mostrar', 'error'); return; }
        revealed[id] = r.data.body;
        render();
    }

    // Reportar
    let reportFor: number | null = null;
    function openReport(id: number) {
        const m = find(id);
        if (!m || !reportDlg) return;
        reportFor = id;
        const name = nameOf(m.author);
        reportDlg.querySelector('[data-rp-name]')!.textContent = firstName(name);
        reportDlg.querySelector('[data-rp-meta]')!.textContent = `${name} · ${hm(m.at)}`;
        const text = bodyOf(m);
        reportDlg.querySelector('[data-rp-body]')!.textContent = text.length > 300 ? `${text.slice(0, 300)}…` : text;
        const form = reportDlg.querySelector<HTMLFormElement>('[data-ms-report-form]')!;
        form.reset();
        reportDlg.querySelector('[data-rp-count]')!.textContent = '0/200';
        reportDlg.showModal();
        reportDlg.querySelector<HTMLInputElement>('input[name="reason"]:checked')?.focus();
    }
    if (reportDlg) {
        const form = reportDlg.querySelector<HTMLFormElement>('[data-ms-report-form]')!;
        const note = reportDlg.querySelector<HTMLTextAreaElement>('[data-rp-note]')!;
        const count = reportDlg.querySelector<HTMLElement>('[data-rp-count]')!;
        note.addEventListener('input', () => { count.textContent = `${note.value.length}/200`; });
        reportDlg.querySelector('[data-rp-cancel]')?.addEventListener('click', () => reportDlg.close());
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (reportFor === null) return;
            const reason = (new FormData(form).get('reason') as 'spam' | 'harassment' | 'other' | null) ?? 'other';
            const sendBtnR = reportDlg.querySelector<HTMLButtonElement>('[data-rp-send]')!;
            sendBtnR.disabled = true;
            const r = await msgApi.report(conv, reportFor, reason, note.value.trim() || undefined);
            sendBtnR.disabled = false;
            if (r.ok) { reportDlg.close(); showToast('Gracias. Lo revisaremos.'); }
            else if (r.status === 409) { reportDlg.close(); showToast('Ya lo habías reportado'); }
            else showToast('No se ha podido enviar. Inténtalo otra vez.', 'error');
        });
    }

    // ---- Menú de un mensaje (escritorio) ------------------------------------------------------
    type Act = { key: string; label: string; icon: string; danger?: boolean };
    function actionsFor(id: number): Act[] {
        const m = find(id);
        if (!m || m.kind === 'system' || m.deleted) return [];
        if (m.folded && !(id in revealed)) {
            return [{ key: 'reveal', label: 'Mostrar', icon: 'eye' }, { key: 'report', label: 'Reportar', icon: 'flag' }];
        }
        const copyA = { key: 'copy', label: 'Copiar texto', icon: 'copy' };
        return m.author === me
            ? [copyA, { key: 'delete', label: 'Borrar mensaje', icon: 'trash-2', danger: true }]
            : [copyA, { key: 'report', label: 'Reportar', icon: 'flag' }];
    }
    function run(key: string, id: number) {
        if (key === 'copy') void copy(id);
        else if (key === 'delete') void remove(id);
        else if (key === 'report') openReport(id);
        else if (key === 'reveal') void reveal(id);
    }

    let menuBtn: HTMLButtonElement | null = null;
    function openMenu(btn: HTMLButtonElement, id: number) {
        const acts = actionsFor(id);
        if (!acts.length) return;
        closeMenu(false);
        menuFor = id;
        menuBtn = btn;
        btn.setAttribute('aria-expanded', 'true');
        btn.closest('.mm')?.classList.add('is-menu');
        menu.innerHTML = acts.map((a, i) => (i === acts.length - 1 && acts.length > 1 ? '<hr>' : '')
            + `<button type="button" role="menuitem" data-mkey="${a.key}"${a.danger ? ' class="pf-danger"' : ''}>${icon(a.icon)}${esc(a.label)}</button>`).join('');
        menu.hidden = false;
        const r = btn.getBoundingClientRect();
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        const top = r.bottom + 6 + h > window.innerHeight ? r.top - 6 - h : r.bottom + 6;
        menu.style.top = `${Math.max(8, top)}px`;
        menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
        menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
    function closeMenu(restoreFocus = true) {
        if (menuFor === null) return;
        menu.hidden = true;
        menuBtn?.setAttribute('aria-expanded', 'false');
        menuBtn?.closest('.mm')?.classList.remove('is-menu');
        const line = menuBtn?.closest<HTMLElement>('.mm');
        menuFor = null;
        menuBtn = null;
        if (dirty) render();
        if (restoreFocus) (logEl.querySelector<HTMLElement>(`[data-mid="${line?.dataset.mid}"]`) ?? line)?.focus({ preventScroll: true });
    }
    menu.addEventListener('click', (e) => {
        const b = (e.target as Element).closest<HTMLElement>('[data-mkey]');
        if (!b || menuFor === null) return;
        const id = menuFor;
        closeMenu(b.dataset.mkey !== 'report');
        run(b.dataset.mkey!, id);
    });
    menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        } else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
        else if (e.key === 'Tab') closeMenu(false);
    });
    document.addEventListener('click', (e) => {
        if (menuFor !== null && !menu.contains(e.target as Node) && !(e.target as Element).closest?.('[data-mact="menu"]')) closeMenu(false);
    });
    window.addEventListener('resize', () => closeMenu(false));
    scroller.addEventListener('scroll', () => closeMenu(false), { passive: true });

    logEl.addEventListener('click', (e) => {
        const t = e.target as Element;
        const act = t.closest<HTMLButtonElement>('[data-mact]');
        const line = t.closest<HTMLElement>('[data-mid]');
        if (act && line) {
            const id = Number(line.dataset.mid);
            if (act.dataset.mact === 'copy') void copy(id);
            else if (menuFor === id) closeMenu();
            else openMenu(act, id);
            return;
        }
        const rv = t.closest<HTMLElement>('[data-reveal]');
        if (rv) { void reveal(Number(rv.dataset.reveal)); return; }
        const retry = t.closest<HTMLElement>('[data-retry]');
        if (retry) { const p = pending.find((x) => x.clientId === retry.dataset.retry); if (p) void send(p); return; }
        const discard = t.closest<HTMLElement>('[data-discard]');
        if (discard) { pending = pending.filter((x) => x.clientId !== discard.dataset.discard); saveFailed(); render(); }
    });

    // Teclado dentro del registro: ↑/↓ entre líneas, Enter abre su menú, Esc vuelve al registro.
    scroller.addEventListener('keydown', (e) => {
        const lines = [...logEl.querySelectorAll<HTMLElement>('.mm[tabindex]')];
        if (!lines.length) return;
        const cur = (document.activeElement as HTMLElement).closest?.<HTMLElement>('.mm[tabindex]');
        const i = cur ? lines.indexOf(cur) : -1;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if ((e.target as Element).closest('[data-mact]')) return;
            e.preventDefault();
            const j = i < 0 ? lines.length - 1 : Math.max(0, Math.min(lines.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
            lines[j].focus();
            lines[j].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && cur && e.target === cur) {
            e.preventDefault();
            const b = cur.querySelector<HTMLButtonElement>('[data-mact="menu"]');
            if (b) openMenu(b, Number(cur.dataset.mid));
        } else if (e.key === 'Escape' && cur) {
            scroller.focus();
        }
    });

    // ---- Pulsación larga (móvil) → hoja de acciones -------------------------------------------
    let pressTimer = 0;
    let pressStart: { x: number; y: number } | null = null;
    let pressFired = false;
    const cancelPress = () => { window.clearTimeout(pressTimer); pressStart = null; };
    logEl.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || !mobile.matches) return;
        const line = (e.target as Element).closest<HTMLElement>('.mm[data-mid], .ms-fold[data-mid]');
        if (!line) return;
        pressFired = false;
        pressStart = { x: e.clientX, y: e.clientY };
        pressTimer = window.setTimeout(() => { pressFired = true; openSheet(Number(line.dataset.mid), line); }, 450);
    });
    logEl.addEventListener('pointermove', (e) => {
        if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => logEl.addEventListener(t, cancelPress));
    scroller.addEventListener('scroll', cancelPress, { passive: true });
    // Tras la pulsación larga no se sigue un enlace ni sale el menú del sistema.
    logEl.addEventListener('click', (e) => { if (pressFired) { e.preventDefault(); e.stopPropagation(); pressFired = false; } }, true);
    logEl.addEventListener('contextmenu', (e) => { if (mobile.matches && (e.target as Element).closest('.mm, .ms-fold')) e.preventDefault(); });

    let lifted: HTMLElement | null = null;
    function openSheet(id: number, line: HTMLElement) {
        const m = find(id);
        const acts = actionsFor(id);
        if (!m || !acts.length || !actSheet) return;
        const who = people[m.author ?? ''];
        const own = m.author === me;
        const label = `Mensaje de ${own ? 'ti' : nameOf(m.author)} · ${hm(m.at)}`;
        const card = m.folded && !(id in revealed)
            ? ''
            : `<div class="msh-card"><div class="mg">${avatarHtml(who ?? { id: '', handle: null, name: DELETED_ACCOUNT, avatar: null, archetype: null, color: 'slate', initials: '?' }, 32)}`
                + `<div class="mg-b"><div class="mg-h"><b>${esc(nameOf(m.author))}</b>${own ? '<span class="me">tú</span>' : ''}<time>${hm(m.at)}</time></div>`
                + `<div class="mm"><span class="mm-t">${esc(bodyOf(m))}</span></div></div></div></div>`;
        actSheet.querySelector('[data-ms-act-body]')!.innerHTML = `<div class="msh-k">${esc(label)}</div>${card}`
            + `<div role="menu" aria-label="${esc(label)}">`
            + acts.map((a) => `<button type="button" role="menuitem" class="msa${a.danger ? ' dg' : ''}" data-skey="${a.key}">${icon(a.icon)}${esc(a.label)}</button>`).join('')
            + `</div>`;
        lifted = line;
        line.classList.add('is-lift');
        if (navigator.vibrate) navigator.vibrate(10);
        actSheet.showModal();
        actSheet.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        actSheet.onclick = (e) => {
            const b = (e.target as Element).closest<HTMLElement>('[data-skey]');
            if (b) { actSheet.close(); run(b.dataset.skey!, id); return; }
            // Toque fuera de la hoja (en el fondo atenuado): cerrar.
            if (e.target === actSheet) actSheet.close();
        };
    }
    actSheet?.addEventListener('close', () => { lifted?.classList.remove('is-lift'); lifted = null; });

    // ---- Información y Silenciar ---------------------------------------------------------------
    const infoToggle = root.querySelector<HTMLButtonElement>('[data-ms-info-toggle]');
    if (infoToggle && shell) {
        infoToggle.setAttribute('aria-pressed', String(!shell.classList.contains('noinfo')));
        infoToggle.addEventListener('click', () => {
            const show = shell.classList.toggle('noinfo') === false;
            infoToggle.setAttribute('aria-pressed', String(show));
            store.set(localStorage, 'yf:chat-info', show ? '1' : '0');
        });
    }
    root.querySelector('[data-ms-info-open]')?.addEventListener('click', () => infoSheet?.showModal());
    infoSheet?.addEventListener('click', (e) => {
        const t = e.target as Element;
        // «Recomendar algo» abre el selector de F4, que no vive en la capa superior: fuera la hoja.
        if (e.target === infoSheet || t.closest('[data-recommend], a[href]')) infoSheet.close();
    });

    async function setMuted(next: boolean) {
        const prev = muted;
        const paint = (v: boolean) => {
            muted = v;
            document.querySelectorAll<HTMLElement>('[data-ms-mute]').forEach((s) => s.setAttribute('aria-checked', String(v)));
            const ico = root.querySelector<HTMLElement>('[data-ms-muted-ico]');
            if (ico) ico.hidden = !v;
        };
        paint(next);
        const r = await msgApi.patch(conv, { muted: next });
        if (!r.ok) { paint(prev); showToast('No se ha podido cambiar. Inténtalo otra vez.', 'error'); return; }
        refreshList();
    }
    document.addEventListener('click', (e) => {
        if ((e.target as Element).closest?.('[data-ms-mute]')) void setMuted(!muted);
    });

    // ---- Móvil: pantalla completa pegada al teclado ---------------------------------------------
    const vv = window.visualViewport;
    const fitViewport = () => {
        if (!mobile.matches || !vv) {
            root.style.removeProperty('--ms-vvh');
            root.style.removeProperty('top');
            document.documentElement.classList.remove('ms-lock');
            return;
        }
        const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
        document.documentElement.classList.add('ms-lock');
        root.style.setProperty('--ms-vvh', `${vv.height}px`);
        root.style.top = `${vv.offsetTop}px`;
        // Al abrir el teclado, el último mensaje sigue a la vista.
        if (atBottom) scroller.scrollTop = scroller.scrollHeight;
    };
    vv?.addEventListener('resize', fitViewport);
    vv?.addEventListener('scroll', fitViewport);
    mobile.addEventListener('change', () => { fitViewport(); render(); });
    fitViewport();

    // ---- Arranque --------------------------------------------------------------------------------
    // El servidor ya pintó todo; con mensajes sin enviar de antes, o en móvil (avatares de 32), se repinta.
    if (pending.length || mobile.matches) render('bottom');
    else scroller.scrollTop = scroller.scrollHeight;
    void markRead();
    poller.start();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void markRead(); });
}

// Al final: `init` usa constantes de módulo (`store`) que antes de su línea aún no existen.
const root = document.querySelector<HTMLElement>('[data-ms-chat]');
const raw = document.getElementById('ms-data')?.textContent;
if (root && raw) init(root, JSON.parse(raw) as ChatView);
