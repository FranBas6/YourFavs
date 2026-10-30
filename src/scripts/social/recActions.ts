/**
 * Lo que hace quien RECIBE una recomendación (F4; handoff F4 §5.3–5.5), en la campana, en
 * `/mislistas/notificaciones` y en el centro «Amigos» → Pendientes:
 *
 *   · `[data-ra]`: añadir a Pendientes, activar avisos, ver la productora o descartar.
 *   · `[data-rq]`: una respuesta rápida. `[data-rq-write]`: «Escribir algo…» (una línea, Enter
 *     envía). Una sola respuesta: después queda citada y no hay más botones. No es un chat.
 *
 * La pieza (`[data-rec]`) no desaparece al actuar: su zona pasa al estado final en el mismo sitio,
 * pintada con `lib/social/recUi.ts` a partir de la recomendación que devuelve el servidor.
 */
import { recActionsHtml, recAriaLabel, recStatusHtml, replyWriteHtml } from '../../lib/social/recUi';
import { showToast } from './toast';
import type { RecReceived } from '../../lib/social/types';

function repaint(host: HTMLElement, rec: RecReceived) {
    const pending = rec.shown === 'pending' && !rec.reply;
    const zone = host.querySelector<HTMLElement>('[data-rec-zone]');
    const side = host.querySelector<HTMLElement>('[data-rec-side]');
    const size = host.closest('[data-notif-page]') ? 'md' : 'sm';
    if (side) {
        // Tarjeta del centro: los botones a un lado; el estado, debajo del texto.
        side.innerHTML = pending ? recActionsHtml(rec, 'sm') : '';
        if (zone) zone.innerHTML = pending ? '' : recStatusHtml(rec, rec.from.name);
    } else if (zone) {
        zone.innerHTML = pending ? `<div class="nt-acts">${recActionsHtml(rec, size)}</div>` : recStatusHtml(rec, rec.from.name);
    }
    host.setAttribute('aria-label', recAriaLabel(rec, rec.from.name, host.classList.contains('is-unread')));
}

/** Actuar o responder desde un aviso lo da por leído (el servidor ya lo marcó). */
function markRead(host: HTMLElement) {
    if (!host.classList.contains('notif-item') || !host.classList.contains('is-unread')) return;
    host.classList.remove('is-unread');
    host.querySelector('.notif-dot')?.remove();
    document.dispatchEvent(new CustomEvent('yf:notif-read', { detail: { id: host.dataset.id } }));
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; rec?: RecReceived; error?: string }> {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        return { ...d, ok: res.ok && d.ok };
    } catch {
        return { ok: false };
    }
}

async function act(host: HTMLElement, btn: HTMLButtonElement) {
    const id = host.dataset.rec;
    const action = btn.dataset.ra;
    if (!id || !action || btn.disabled) return;
    host.querySelectorAll<HTMLButtonElement>('[data-ra]').forEach((b) => { b.disabled = true; });
    const r = await post(`/api/social/recommendations/${id}/act`, { action });
    if (!r.ok || !r.rec) {
        host.querySelectorAll<HTMLButtonElement>('[data-ra]').forEach((b) => { b.disabled = false; });
        if (r.rec) repaint(host, r.rec);
        showToast(r.error === 'gone' ? 'Esa recomendación ya no está pendiente.' : 'No se ha podido. Inténtalo otra vez.', 'error');
        return;
    }
    markRead(host);
    repaint(host, r.rec);
    // «Ver productora»: se marca como abierta y se va a su página.
    if (action === 'open' && btn.dataset.href) location.href = btn.dataset.href;
}

async function reply(host: HTMLElement, body: { key: string } | { text: string }, restore: () => void) {
    const r = await post(`/api/social/recommendations/${host.dataset.rec}/reply`, body);
    if (!r.ok || !r.rec) {
        if (r.error === 'already' && r.rec) { repaint(host, r.rec); return; }
        restore();
        showToast('No se ha podido enviar la respuesta', 'error');
        return;
    }
    markRead(host);
    repaint(host, r.rec);
}

document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const host = t.closest<HTMLElement>('[data-rec]');
    if (!host) return;

    const ra = t.closest<HTMLButtonElement>('[data-ra]');
    if (ra) { e.preventDefault(); act(host, ra); return; }

    const quick = t.closest<HTMLButtonElement>('[data-rq]');
    if (quick) {
        e.preventDefault();
        const row = quick.closest<HTMLElement>('.qr');
        const before = row?.outerHTML ?? '';
        row?.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
        reply(host, { key: quick.dataset.rq! }, () => { if (row?.isConnected) row.outerHTML = before; });
        return;
    }

    const write = t.closest<HTMLElement>('[data-rq-write]');
    if (write) {
        e.preventDefault();
        const row = write.closest<HTMLElement>('.qr');
        if (!row) return;
        const before = row.outerHTML;
        row.outerHTML = replyWriteHtml(host.dataset.from || '');
        const box = host.querySelector<HTMLElement>('.qr-w');
        if (box) box.dataset.before = before;
        const input = host.querySelector<HTMLInputElement>('.qr-in');
        input?.focus();
        // Que el campo no quede debajo del teclado en móvil.
        input?.scrollIntoView({ block: 'nearest' });
        return;
    }

    if (t.closest('[data-rq-cancel]')) {
        const box = t.closest<HTMLElement>('.qr-w');
        if (box?.dataset.before) box.outerHTML = box.dataset.before;
        return;
    }

    if (t.closest('[data-rq-send]')) {
        const box = t.closest<HTMLElement>('.qr-w');
        const input = box?.querySelector<HTMLInputElement>('.qr-in');
        sendWritten(host, box, input);
    }
});

function sendWritten(host: HTMLElement, box: HTMLElement | null | undefined, input: HTMLInputElement | null | undefined) {
    if (!box || !input) return;
    const text = input.value.replace(/\s+/g, ' ').trim();
    if (!text) { input.focus(); return; }
    input.disabled = true;
    // Si falla, el campo se queda con lo escrito para reintentar.
    reply(host, { text }, () => { input.disabled = false; input.focus(); });
}

document.addEventListener('input', (e) => {
    const input = e.target as HTMLElement;
    if (!input.matches?.('.qr-in')) return;
    const n = (input as HTMLInputElement).value.length;
    const cnt = input.closest('.qr-w')?.querySelector('.qr-n');
    if (cnt) {
        cnt.textContent = `${n}/140`;
        // Solo se anuncia al cruzar 120, 130 y 140.
        cnt.setAttribute('aria-live', n === 120 || n === 130 || n === 140 ? 'polite' : 'off');
    }
});

document.addEventListener('keydown', (e) => {
    const input = e.target as HTMLElement;
    if (!input.matches?.('.qr-in')) return;
    const host = input.closest<HTMLElement>('[data-rec]');
    if (!host) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        sendWritten(host, input.closest<HTMLElement>('.qr-w'), input as HTMLInputElement);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const box = input.closest<HTMLElement>('.qr-w');
        if (box?.dataset.before) box.outerHTML = box.dataset.before;
    }
});
