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
import {
    GROUP_NAME_MAX, MSG_MAX, cardHref, chatSubtitle, hm, infoHtml, logHtml, newAnchor, num, otherOf, renameHtml, spoilerLabel, type PendingMsg,
} from '../../../lib/social/chatView';
import { DELETED_ACCOUNT, FOLDED_TEXT } from '../../../lib/social/messagesText';
import { avatarHtml, esc, firstName, icon } from '../../../lib/social/ui';
import { msgApi } from './api';
import { createPoller } from './poller';
import { initWtw } from './wtw';
import { showToast } from '../toast';
import type { ChatMessage, ChatView, RecShown, SpoilerRef } from '../../../lib/social/types';

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
    let current: ChatView = chat;
    let renaming = false;
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
            other: group ? null : otherOf(current),
        });
        if (mode === 'bottom' || (mode === 'keep' && atBottom)) scroller.scrollTop = scroller.scrollHeight;
        else if (mode === 'prepend') scroller.scrollTop = scroller.scrollHeight - fromBottom;
        if (focusedId) logEl.querySelector<HTMLElement>(`[data-mid="${focusedId}"]`)?.focus({ preventScroll: true });
    }

    function announce(fresh: ChatMessage[]) {
        const lines = fresh
            .filter((m) => m.author !== me && m.kind === 'text' && !m.deleted)
            .map((m) => `${nameOf(m.author)}: ${m.folded ? FOLDED_TEXT : m.locked && m.spoiler ? `spoiler de ${spoilerLabel(m.spoiler)}, oculto` : m.body || (m.card ? `ha compartido ${m.card.ref.title}` : '')}`);
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

    // ---- Sondeo (5 s; 30 s con el tiempo real conectado) ----------------------------------------
    const BASE_POLL = 5000;
    const poller = createPoller(async () => {
        const last = lastId();
        const r = await msgApi.chat(conv, last ? { after: last, from: firstId() } : {});
        // Ya no estás (te quitaron, o el 1:1 dejó de estar en tu lista): la página lo explica.
        if (r.status === 404) { location.reload(); return true; }
        if (!r.ok) return false;
        const c = r.data.chat;
        // Personas y papeles: los avisos de admin no llegan a todo el mundo, así que el panel se
        // repinta al cambiar esto, no solo con un mensaje de sistema.
        const sig = (v: ChatView) => `${v.title}|${v.me.role}|${v.members.map((m) => `${m.person.id}:${m.role}:${m.blockedByMe ? 1 : 0}`).join(',')}`;
        const metaChanged = sig(c) !== sig(current);
        current = { ...c, me: { ...c.me, muted } };
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
        if (metaChanged || fresh.some((m) => m.kind === 'system')) repaintMeta(c);
        if (changed) render();
        announce(fresh);
        if (fresh.some((m) => m.author !== me)) void markRead();
        return true;
    }, BASE_POLL);

    function repaintMeta(c: ChatView) {
        const t = root.querySelector('[data-ms-title]');
        const s = root.querySelector('[data-ms-sub]');
        if (t) t.textContent = c.title;
        if (s) s.textContent = chatSubtitle(c);
        // Renombrando: no se pisa el campo; se repinta al terminar.
        if (renaming) return;
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
        const r = await msgApi.send(conv, p.body, p.clientId, p.spoiler);
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
            // La marca de spoiler se va con este mensaje y se quita del compositor.
            const sp = spoiler;
            setSpoiler(null);
            void send({ clientId: uuid(), body, at: Date.now(), failed: false, spoiler: sp });
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
    }

    // ---- ＋ del compositor (M4): menú anclado en escritorio, hoja en móvil ---------------------
    const plusBtn = root.querySelector<HTMLButtonElement>('[data-ms-plus]');
    const plusMenu = root.querySelector<HTMLElement>('#ms-pm');
    const plusSheet = document.getElementById('ms-pm-sheet') as HTMLDialogElement | null;
    const setPlus = (open: boolean) => {
        plusBtn?.classList.toggle('open', open);
        plusBtn?.setAttribute('aria-expanded', String(open));
        // El icono (＋ / ✕) cambia por CSS: si se sustituyera el <svg>, el clic que lo abre quedaría
        // «fuera» del botón (su objetivo ya no estaría en la página) y el menú se cerraría al momento.
    };
    function closePlus(restoreFocus = false) {
        if (plusMenu && !plusMenu.hidden) plusMenu.hidden = true;
        if (plusSheet?.open) plusSheet.close();
        setPlus(false);
        if (restoreFocus) plusBtn?.focus();
    }
    plusBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (plusBtn.getAttribute('aria-expanded') === 'true') { closePlus(); return; }
        setPlus(true);
        if (mobile.matches) { plusSheet?.showModal(); return; }
        if (!plusMenu) return;
        plusMenu.hidden = false;
        plusMenu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    plusSheet?.addEventListener('close', () => setPlus(false));
    plusSheet?.addEventListener('click', (e) => {
        // Tocar fuera de la hoja (el fondo) o elegir una acción la cierra.
        if (e.target === plusSheet || (e.target as Element).closest('[role="menuitem"]')) plusSheet.close();
    });
    plusMenu?.addEventListener('click', (e) => { if ((e.target as Element).closest('[role="menuitem"]')) closePlus(); });
    plusMenu?.addEventListener('keydown', (e) => {
        const items = [...plusMenu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePlus(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
        else if (e.key === 'Tab') closePlus();
    });
    document.addEventListener('click', (e) => {
        const path = e.composedPath();
        if (plusMenu && !plusMenu.hidden && !path.includes(plusMenu) && !(plusBtn && path.includes(plusBtn))) closePlus();
    });

    // «¿Qué vemos?» (M4d): la tirada enviada entra como un mensaje más.
    if (!chat.readOnly) {
        initWtw({
            conv, chat,
            onSent: (m) => { merge([m]); readSent = Math.max(readSent, m.id); render('bottom'); refreshList(); },
        });
    }

    // Tarjeta enviada desde el selector («Compartir un título»): entra como un mensaje más.
    document.addEventListener('yf:ms-card-sent', (e) => {
        const d = (e as CustomEvent<{ conv: number; message: ChatMessage }>).detail;
        if (!d || d.conv !== conv) return;
        merge([d.message]);
        readSent = Math.max(readSent, d.message.id);
        render('bottom');
        refreshList();
        input?.focus();
    });

    // «Añadir a Pendientes» desde una tarjeta: tu píldora cambia en todas las de ese título.
    async function addPending(btn: HTMLButtonElement) {
        const mt = btn.dataset.mt;
        const id = Number(btn.dataset.tmdb);
        if ((mt !== 'movie' && mt !== 'tv') || !id) return;
        btn.disabled = true;
        let ok = false;
        try {
            const res = await fetch('/api/lists/fixed', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ media_type: mt, tmdb_id: id, list: 'pendientes', action: 'add' }),
            });
            ok = res.ok && (await res.json()).ok;
        } catch { /* sin red */ }
        if (!ok) { btn.disabled = false; showToast('No se ha podido añadir. Inténtalo otra vez.', 'error'); return; }
        for (const m of msgs) {
            if (m.card?.type === 'title' && m.card.ref.mediaType === mt && m.card.ref.tmdbId === id && !m.card.viewer) m.card.viewer = { state: 'pending' };
        }
        render();
        showToast('Añadida a Pendientes');
    }

    // Recomendación recibida (M4b): lo mismo que en la campana (mismo endpoint de F4). La tarjeta
    // pasa a su estado final en el sitio; la campana y el centro de Amigos lo verán al pintarse.
    async function actRec(btn: HTMLButtonElement) {
        const id = Number(btn.dataset.recId);
        const action = btn.dataset.tcRa;
        if (!id || !action || btn.disabled) return;
        const box = btn.closest<HTMLElement>('.tc');
        box?.querySelectorAll<HTMLButtonElement>('[data-tc-ra]').forEach((b) => { b.disabled = true; });
        let rec: { shown: RecShown } | null = null;
        let error = '';
        try {
            const res = await fetch(`/api/social/recommendations/${id}/act`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
            });
            const d = await res.json().catch(() => ({}));
            rec = d.rec ?? null;
            if (!res.ok || !d.ok) error = d.error || 'error';
        } catch { error = 'error'; }
        if (rec) {
            for (const m of msgs) if (m.card?.type === 'rec' && m.card.ref.recId === id) m.card.state = rec.shown;
            render();
        } else {
            box?.querySelectorAll<HTMLButtonElement>('[data-tc-ra]').forEach((b) => { b.disabled = false; });
        }
        if (error) { showToast(error === 'gone' ? 'Esa recomendación ya no está pendiente.' : 'No se ha podido. Inténtalo otra vez.', 'error'); return; }
        if (action === 'open' && btn.dataset.href) location.href = btn.dataset.href;
    }

    // ---- Acciones sobre un mensaje ----------------------------------------------------------
    // Una tarjeta se copia con su enlace (el comentario, si lo hay, delante).
    const bodyOf = (m: ChatMessage) => {
        const text = m.folded || m.locked ? revealed[m.id] ?? '' : m.body ?? '';
        if (!m.card) return text;
        const link = `${m.card.ref.title} · ${location.origin}${cardHref(m.card)}`;
        return text ? `${text}\n${link}` : link;
    };

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

    // ---- Spoilers (M4c) ----------------------------------------------------------------------
    // La marca del compositor: lo siguiente que envíes sale oculto para quien no haya llegado.
    let spoiler: SpoilerRef | null = null;
    const tagRow = root.querySelector<HTMLElement>('[data-ms-ctag]');
    const baseLabel = input?.getAttribute('aria-label') ?? '';
    function setSpoiler(sp: SpoilerRef | null) {
        spoiler = sp;
        if (input) input.setAttribute('aria-label', sp ? `${baseLabel}, marcado como spoiler de ${spoilerLabel(sp)}` : baseLabel);
        if (!tagRow) return;
        tagRow.hidden = !sp;
        tagRow.innerHTML = sp
            ? `<span class="ctag">${icon('shield')}<span>Spoiler de <b>${esc(spoilerLabel(sp))}</b></span>`
                + `<button type="button" data-ms-ctag-x aria-label="Quitar la marca de spoiler">${icon('x')}</button></span>`
            : '';
    }
    tagRow?.addEventListener('click', (e) => {
        if (!(e.target as Element).closest('[data-ms-ctag-x]')) return;
        setSpoiler(null);
        input?.focus();
    });
    document.addEventListener('yf:ms-spoiler-set', (e) => {
        const d = (e as CustomEvent<{ conv: number; spoiler: SpoilerRef }>).detail;
        if (!d || d.conv !== conv) return;
        setSpoiler(d.spoiler);
        input?.focus();
    });

    /** «Mostrar igualmente»: el texto solo para esta sesión; el foco va al texto. */
    async function showSpoiler(id: number) {
        const r = await msgApi.spoiler(conv, id);
        if (!r.ok) { showToast('No se ha podido mostrar', 'error'); return; }
        revealed[id] = r.data.body;
        render();
        logEl.querySelector<HTMLElement>(`[data-mid="${id}"] [data-sp-text]`)?.focus();
    }
    function hideSpoiler(id: number) {
        delete revealed[id];
        render();
        logEl.querySelector<HTMLElement>(`[data-mid="${id}"] [data-spoil-show]`)?.focus();
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
        // Spoiler aún oculto: sin copiar (no hay texto), y «Mostrar igualmente» a mano.
        if (m.locked && !(id in revealed)) {
            return [{ key: 'spoil', label: 'Mostrar igualmente', icon: 'eye' }, { key: 'report', label: 'Reportar', icon: 'flag' }];
        }
        const copyA = m.card ? { key: 'copy', label: 'Copiar enlace', icon: 'link' } : { key: 'copy', label: 'Copiar texto', icon: 'copy' };
        return m.author === me
            ? [copyA, { key: 'delete', label: 'Borrar mensaje', icon: 'trash-2', danger: true }]
            : [copyA, { key: 'report', label: 'Reportar', icon: 'flag' }];
    }
    function run(key: string, id: number) {
        if (key === 'copy') void copy(id);
        else if (key === 'delete') void remove(id);
        else if (key === 'report') openReport(id);
        else if (key === 'reveal') void reveal(id);
        else if (key === 'spoil') void showSpoiler(id);
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
        const add = t.closest<HTMLButtonElement>('[data-tc-add]');
        if (add) { void addPending(add); return; }
        const ra = t.closest<HTMLButtonElement>('[data-tc-ra]');
        if (ra) { void actRec(ra); return; }
        const rv = t.closest<HTMLElement>('[data-reveal]');
        if (rv) { void reveal(Number(rv.dataset.reveal)); return; }
        const sps = t.closest<HTMLElement>('[data-spoil-show]');
        if (sps) { void showSpoiler(Number(sps.dataset.spoilShow)); return; }
        const sph = t.closest<HTMLElement>('[data-spoil-hide]');
        if (sph) { hideSpoiler(Number(sph.dataset.spoilHide)); return; }
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
        // Lo mismo con «Añadir personas» (el selector de grupo).
        if (e.target === infoSheet || t.closest('[data-recommend], [data-ms-addpeople], a[href]')) infoSheet.close();
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

    // ---- Grupo (M2): renombrar, hacer admin, quitar y salir (handoff §4.8 y §4.10) -----------------
    // `current`: nombre, personas y papeles al día (el sondeo lo actualiza).
    document.addEventListener('yf:ms-chat-refresh', () => poller.now());
    const confirmDlg = document.getElementById('ms-confirm') as HTMLDialogElement | null;

    function closeMemberMenus() {
        document.querySelectorAll<HTMLElement>('.ms-info [data-menu-toggle][aria-expanded="true"], .ms-info-in [data-menu-toggle][aria-expanded="true"]').forEach((t) => {
            t.setAttribute('aria-expanded', 'false');
            const m = t.parentElement?.querySelector<HTMLElement>('.pf-menu');
            if (m) m.hidden = true;
        });
    }

    /** Confirmación sin Deshacer (`role="alertdialog"`). Resuelve true con el botón principal. */
    function ask(o: { icon: string; title: string; text: string; cons?: string; ok: string }): Promise<boolean> {
        if (!confirmDlg) return Promise.resolve(false);
        confirmDlg.querySelector('[data-cf-ico]')!.innerHTML = icon(o.icon);
        confirmDlg.querySelector('[data-cf-title]')!.textContent = o.title;
        confirmDlg.querySelector('[data-cf-text]')!.textContent = o.text;
        const cons = confirmDlg.querySelector<HTMLElement>('[data-cf-cons]')!;
        cons.hidden = !o.cons;
        cons.innerHTML = o.cons ? `<div>${icon('shield')}<span>${o.cons}</span></div>` : '';
        const okBtn = confirmDlg.querySelector<HTMLButtonElement>('[data-cf-ok]')!;
        okBtn.innerHTML = `${icon(o.icon)}${esc(o.ok)}`;
        return new Promise((resolve) => {
            let result = false;
            const done = () => { confirmDlg.removeEventListener('close', done); resolve(result); };
            confirmDlg.addEventListener('close', done);
            okBtn.onclick = () => { result = true; confirmDlg.close(); };
            confirmDlg.querySelector<HTMLButtonElement>('[data-cf-cancel]')!.onclick = () => confirmDlg.close();
            confirmDlg.showModal();
            confirmDlg.querySelector<HTMLElement>('[data-cf-cancel]')?.focus();
        });
    }

    // Renombrar en el propio panel: Enter guarda, Esc cancela.
    function startRename(box: HTMLElement) {
        const name = box.querySelector<HTMLElement>('[data-gm-name]');
        if (!name) return;
        renaming = true;
        name.outerHTML = renameHtml(current.title);
        const input = box.querySelector<HTMLInputElement>('[data-gm-ren-in]');
        input?.focus();
        input?.select();
    }
    function stopRename() {
        renaming = false;
        repaintMeta(current);
    }
    async function saveRename(box: HTMLElement) {
        const input = box.querySelector<HTMLInputElement>('[data-gm-ren-in]');
        const v = (input?.value ?? '').replace(/\s+/g, ' ').trim();
        if (!v || v.length > GROUP_NAME_MAX) { showToast('El nombre tiene que tener de 1 a 40 caracteres.', 'error'); input?.focus(); return; }
        if (v === current.title) { stopRename(); return; }
        const r = await msgApi.patch(conv, { name: v });
        if (!r.ok) { showToast(r.status === 403 ? 'Ya no administras este grupo.' : 'No se ha podido cambiar el nombre.', 'error'); return; }
        current = { ...current, title: v };
        stopRename();
        showToast('Nombre cambiado');
        poller.now();
        refreshList();
    }

    async function makeAdmin(uid: string, name: string) {
        const r = await msgApi.makeAdmin(conv, uid);
        if (!r.ok) { showToast(r.status === 403 ? 'Ya no administras este grupo.' : 'No se ha podido. Inténtalo otra vez.', 'error'); return; }
        showToast(`Ahora ${firstName(name)} es admin`);
        poller.now();
    }

    async function removeMember(uid: string, name: string) {
        const first = firstName(name);
        const mine = firstName(people[me]?.name ?? 'Tú');
        const ok = await ask({
            icon: 'user-minus', title: `¿Quitar a ${first} del grupo?`, ok: 'Quitar',
            text: `${first} dejará de ver «${current.title}» y sus mensajes. En el chat saldrá «${mine} ha quitado a ${first}».`,
        });
        if (!ok) return;
        const r = await msgApi.removeMember(conv, uid);
        if (!r.ok) { showToast(r.status === 403 ? 'Ya no administras este grupo.' : 'No se ha podido quitar. Inténtalo otra vez.', 'error'); return; }
        showToast(`${first} ya no está en el grupo`);
        poller.now();
        refreshList();
    }

    /** «A», «A y B», «A, B y C». */
    const joinNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] ?? '');

    async function leave() {
        const others = current.members.filter((m) => m.person.id !== me);
        let cons = '';
        if (!others.length) {
            cons = '<b>Eres la última persona del grupo.</b> Al salir, el grupo se borra.';
        } else if (current.me.role === 'admin') {
            const admins = others.filter((m) => m.role === 'admin').map((m) => esc(firstName(m.person.name)));
            if (admins.length) {
                cons = `<b>Eres admin, igual que ${joinNames(admins)}.</b> ${joinNames(admins)} ${admins.length > 1 ? 'seguirán' : 'seguirá'} administrando el grupo.`;
            } else {
                // Hereda quien lleva más tiempo (su última entrada), como en la base.
                const heir = [...others].sort((a, b) => a.joinedAt - b.joinedAt || a.person.id.localeCompare(b.person.id))[0];
                cons = `<b>Eres la única persona admin.</b> El cargo pasará a ${esc(firstName(heir.person.name))}, que lleva más tiempo en el grupo.`;
            }
        }
        const ok = await ask({
            icon: 'log-out', title: `¿Salir de «${current.title}»?`, ok: 'Salir del grupo', cons,
            text: 'Dejarás de ver el grupo y sus mensajes. Para volver, alguien tendrá que añadirte.',
        });
        if (!ok) return;
        const r = await msgApi.removeMember(conv, me);
        if (!r.ok) { showToast('No se ha podido salir. Inténtalo otra vez.', 'error'); return; }
        poller.stop();
        store.set(sessionStorage, 'yf:ms-flash', `Has salido de «${current.title}»`);
        location.href = '/mislistas/amigos/mensajes';
    }

    document.addEventListener('click', (e) => {
        const b = (e.target as Element).closest?.<HTMLElement>('[data-gm]');
        if (!b) return;
        const box = b.closest<HTMLElement>('.ms-info, .ms-info-in');
        if (!box) return;
        const uid = b.dataset.uid ?? '';
        const name = b.dataset.name ?? '';
        switch (b.dataset.gm) {
            case 'rename': startRename(box); break;
            case 'rename-cancel': stopRename(); break;
            case 'rename-save': void saveRename(box); break;
            case 'admin': closeMemberMenus(); void makeAdmin(uid, name); break;
            case 'remove': closeMemberMenus(); void removeMember(uid, name); break;
            case 'leave': void leave(); break;
        }
    });
    document.addEventListener('input', (e) => {
        const t = e.target as HTMLElement;
        if (!t.matches?.('[data-gm-ren-in]')) return;
        const n = t.closest('[data-gm-ren]')?.querySelector('[data-gm-ren-n]');
        if (n) n.textContent = `${(t as HTMLInputElement).value.length}/${GROUP_NAME_MAX}`;
    });
    document.addEventListener('keydown', (e) => {
        const t = e.target as HTMLElement;
        if (!t.matches?.('[data-gm-ren-in]')) return;
        const box = t.closest<HTMLElement>('.ms-info, .ms-info-in');
        if (e.key === 'Enter') { e.preventDefault(); if (box) void saveRename(box); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopRename(); }
    });

    // ---- Tiempo real (M3, scripts/social/live.ts) --------------------------------------------------
    // Un aviso de esta conversación (o el «todo» de reconectar) → una vuelta del sondeo ya. Con el
    // canal conectado el sondeo pasa a 30 s, de respaldo; si se cae, vuelve a 5 s.
    const LIVE_POLL = 30_000;
    document.addEventListener('yf:live-msg', (e) => {
        const ids = (e as CustomEvent<{ convs: number[] }>).detail?.convs ?? [];
        if (!ids.length || ids.includes(conv)) poller.now();
    });
    const onLive = (up: boolean) => poller.setBase(up ? LIVE_POLL : BASE_POLL);
    document.addEventListener('yf:live-status', (e) => onLive(Boolean((e as CustomEvent<{ up: boolean }>).detail?.up)));
    onLive(Boolean(window.yfLive?.up));

    // ---- Arranque --------------------------------------------------------------------------------
    // Recién creado el grupo: foco en el compositor (groupPicker.ts).
    if (store.get(sessionStorage, 'yf:ms-focus')) { store.set(sessionStorage, 'yf:ms-focus', null); input?.focus(); }
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
