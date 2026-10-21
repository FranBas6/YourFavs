/**
 * Selectores de tarjetas (Mensajes M4; handoff M4 §3.5 y §4 «Selectores»), sobre el `.rk` de F4:
 * desplegable anclado a su botón en escritorio y hoja inferior en móvil, como el de grupos.
 *
 *   · «Compartir un título» (`[data-share-title]`, desde el ＋ del chat): la conversación ya está
 *     fijada y se elige QUÉ (película o serie) con la búsqueda de siempre. Al enviar, la tarjeta
 *     aparece en el chat (`yf:ms-card-sent`).
 *   · «Enviar a…» (`[data-send-to]`, desde la ficha): el título ya está fijado y se elige DÓNDE, una
 *     sola conversación (las de solo lectura no salen) o un amigo sin conversación («Empezaréis una
 *     conversación»). Al enviar, toast con «Abrir chat».
 *
 * En los dos, un comentario opcional que viaja como el texto del mismo mensaje.
 */
import { avatarHtml, esc, firstName, icon } from '../../../lib/social/ui';
import { MSG_MAX, gavHtml } from '../../../lib/social/chatView';
import { showToast } from '../toast';
import type { ChatMessage, ConvSummary, PersonCard } from '../../../lib/social/types';

interface Title { type: 'movie' | 'tv'; id: number; title: string; sub: string; image: string | null }
/** Destino de «Enviar a…»: una conversación o un amigo sin ella. */
type Dest = { key: string; conv: ConvSummary; friend?: undefined } | { key: string; friend: PersonCard; conv?: undefined };

interface State {
    mode: 'share' | 'sendTo';
    opener: HTMLElement;
    /** Dónde se ancla (el ＋ del chat cuando se abre desde su menú). */
    anchor: HTMLElement;
    sheet: boolean;
    // share
    conv: number;
    convTitle: string;
    q: string;
    tab: 'all' | 'movie' | 'tv';
    hits: Title[];
    pick: Title | null;
    // sendTo
    target: Title | null;
    dests: Dest[];
    dest: string | null;
    loading: boolean;
    sending: boolean;
    error: string | null;
}

const shell = document.getElementById('ck');
const backdrop = document.getElementById('ck-bd');
let st: State | null = null;

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
const POSTER = (p: string) => `https://image.tmdb.org/t/p/w92${p}`;
const KIND = { movie: 'Película', tv: 'Serie' } as const;

function uuid(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Ruta de TMDB («/abc.jpg») a partir de lo que traiga el disparador (ruta o URL entera). */
function tmdbPath(v: string | undefined | null): string | null {
    if (!v) return null;
    const m = v.match(/\/t\/p\/[a-z0-9]+(\/[\w.-]+)$/i);
    const p = m ? m[1] : v;
    return /^\/[\w.-]+$/.test(p) ? p : null;
}

const posterHtml = (t: Pick<Title, 'type' | 'image'>, w: number) =>
    `<span class="rc-lead" style="width:${w}px;height:${Math.round(w * 1.5)}px" aria-hidden="true">${t.image ? `<img src="${POSTER(esc(t.image))}" alt="" loading="lazy" decoding="async">` : icon(t.type === 'movie' ? 'film' : 'tv')}</span>`;

// ---- Pintar ----------------------------------------------------------------------------------
function headHtml(s: State): string {
    const close = `<button type="button" class="rk-x" data-ck-close aria-label="Cerrar">${icon('x')}</button>`;
    const handle = s.sheet ? '<div class="rk-hd" aria-hidden="true"></div>' : '';
    if (s.mode === 'share') {
        return `${handle}<div class="rk-h"><span class="rk-st ck-st">${icon('clapperboard')}</span><div class="rk-h-b"><div class="rk-k">Compartir en</div><b>${esc(s.convTitle)}</b></div>${close}</div>`;
    }
    const t = s.target!;
    return `${handle}<div class="rk-h">${posterHtml(t, 34)}<div class="rk-h-b"><div class="rk-k">Enviar a…</div><b>${esc(t.title)}</b></div>${close}</div>`;
}

function titleRowHtml(h: Title, i: number, on: boolean): string {
    return `<div class="rk-r rad${on ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${on}" data-hit="${i}">`
        + posterHtml(h, 30)
        + `<div class="rk-tx"><b>${esc(h.title)}</b><span class="is-p">${esc([KIND[h.type], /^\d{4}/.exec(h.sub)?.[0]].filter(Boolean).join(' · '))}</span></div>`
        + `<span class="rk-ck">${icon('check')}</span></div>`;
}

function destRowHtml(d: Dest, on: boolean): string {
    const lead = d.conv ? (d.conv.kind === 'group' ? gavHtml(d.conv.faces, 32) : avatarHtml(d.conv.faces[0] ?? { id: '', name: '?', handle: null, avatar: null, initials: '?', color: 'slate' } as PersonCard, 32)) : avatarHtml(d.friend!, 32);
    const name = d.conv ? d.conv.title : d.friend!.name;
    const sub = d.conv ? (d.conv.kind === 'group' ? `Grupo · ${d.conv.count} personas` : 'Conversación') : 'Empezaréis una conversación';
    return `<div class="rk-r rad${on ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${on}" data-dest="${esc(d.key)}">`
        + lead + `<div class="rk-tx"><b>${esc(name)}</b><span class="is-p">${esc(sub)}</span></div><span class="rk-ck">${icon('check')}</span></div>`;
}

function listHtml(s: State): string {
    if (s.mode === 'share') {
        if (s.q.trim().length < 2) return `<p class="rk-note">Escribe el título de una película o serie.</p>`;
        if (s.loading && !s.hits.length) return `<p class="rk-note">Buscando…</p>`;
        const hits = s.hits.map((h, i) => ({ h, i })).filter(({ h }) => s.tab === 'all' || h.type === s.tab);
        if (!hits.length) return `<p class="rk-note">Nada con «${esc(s.q.trim())}».</p>`;
        return hits.map(({ h, i }) => titleRowHtml(h, i, Boolean(s.pick && s.pick.type === h.type && s.pick.id === h.id))).join('');
    }
    if (s.loading) return `<p class="rk-note">Cargando…</p>`;
    if (!s.dests.length) {
        return `<div class="rk-emp"><span class="rk-st">${icon('handshake')}</span><h4>Los mensajes son entre amigos</h4>`
            + `<p>Cuando tengas amigos en YourFavs, podrás mandarles películas y series desde aquí.</p>`
            + `<a class="pf-btn pri sm" href="/mislistas/amigos">${icon('users')}Ir a Amigos</a></div>`;
    }
    const q = s.q.trim().toLowerCase().replace(/^@/, '');
    const match = (d: Dest) => !q || (d.conv ? d.conv.title : d.friend!.name).toLowerCase().includes(q) || (d.friend?.handle ?? d.conv?.faces[0]?.handle ?? '').includes(q);
    const convs = s.dests.filter((d) => d.conv && match(d));
    const friends = s.dests.filter((d) => d.friend && match(d));
    if (!convs.length && !friends.length) return `<p class="rk-note">Nada con «${esc(s.q.trim())}».</p>`;
    return (convs.length ? `<div class="rk-kk">Recientes</div>` + convs.map((d) => destRowHtml(d, s.dest === d.key)).join('') : '')
        + (friends.length ? `<div class="rk-kk">Amigos sin conversación</div>` + friends.map((d) => destRowHtml(d, s.dest === d.key)).join('') : '');
}

function destName(s: State): string {
    const d = s.dests.find((x) => x.key === s.dest);
    if (!d) return '';
    return d.conv ? (d.conv.kind === 'group' ? `«${d.conv.title}»` : firstName(d.conv.title)) : firstName(d.friend!.name);
}

function footHtml(s: State): string {
    const ready = s.mode === 'share' ? Boolean(s.pick) : Boolean(s.dest);
    const label = s.mode === 'share'
        ? (s.opener.dataset.group ? `Compartir en «${s.convTitle}»` : `Compartir con ${firstName(s.convTitle)}`)
        : ready ? `Enviar a ${destName(s)}` : 'Enviar';
    const err = s.error ? `<div class="rk-err" role="alert">${icon('wifi-off')}<span>${esc(s.error)}</span></div>` : '';
    return `${err}<button type="button" class="pf-btn pri" data-ck-send${ready && !s.sending ? '' : ' disabled'}>${icon(s.mode === 'share' ? 'clapperboard' : 'forward')}${esc(label)}</button>`;
}

function renderAll(s: State) {
    if (!shell) return;
    const tabs = s.mode === 'share'
        ? `<div class="rk-tabs" role="tablist" aria-label="Tipo">${(['all', 'movie', 'tv'] as const).map((t) =>
            `<button type="button" role="tab" aria-selected="${s.tab === t}" data-ck-tab="${t}">${{ all: 'Todo', movie: 'Películas', tv: 'Series' }[t]}</button>`).join('')}</div>`
        : '';
    const placeholder = s.mode === 'share' ? 'Buscar película o serie' : 'Buscar conversación o amigo';
    shell.innerHTML = headHtml(s)
        + `<div class="rk-s"><label class="rk-in">${icon('search')}<input type="search" data-ck-q placeholder="${placeholder}" autocomplete="off" spellcheck="false" aria-label="${placeholder}" value="${esc(s.q)}"></label>${tabs}</div>`
        + `<div class="rk-l" data-ck-list role="radiogroup" aria-label="${s.mode === 'share' ? 'Resultados' : 'Conversaciones'}">${listHtml(s)}</div>`
        + `<div class="rk-msg"><textarea data-ck-msg rows="2" maxlength="${MSG_MAX}" placeholder="Añade un comentario (opcional)" aria-label="Comentario opcional"></textarea></div>`
        + `<div class="rk-f" data-ck-foot>${footHtml(s)}</div>`;
}

const part = (sel: string, html: string) => { const el = shell?.querySelector(sel); if (el) el.innerHTML = html; };
const repaint = (s: State) => { part('[data-ck-list]', listHtml(s)); part('[data-ck-foot]', footHtml(s)); };

// ---- Abrir, colocar y cerrar ------------------------------------------------------------------
function place() {
    if (!shell || !st) return;
    if (st.sheet) { shell.style.left = ''; shell.style.top = ''; shell.style.maxHeight = ''; return; }
    const r = st.anchor.getBoundingClientRect();
    const w = shell.offsetWidth;
    const below = window.innerHeight - r.bottom - 18;
    const above = r.top - 18;
    // Desde el ＋ del chat, siempre encima del compositor. Si no, debajo del botón salvo que no quepa.
    // Anclado por el borde que toca al botón: al llegar los resultados crece hacia el otro lado, y la
    // altura máxima es el hueco que hay, así el botón de enviar nunca se sale de la pantalla.
    const up = st.mode === 'share' || (below < 420 && above > below);
    shell.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
    shell.style.maxHeight = `${Math.min(560, up ? above : below)}px`;
    if (up) { shell.style.top = 'auto'; shell.style.bottom = `${window.innerHeight - r.top + 10}px`; }
    else { shell.style.bottom = ''; shell.style.top = `${r.bottom + 10}px`; }
}

export function openPick(opener: HTMLElement) {
    if (!shell) return;
    if (!document.cookie.split('; ').some((c) => c.startsWith('has_session='))) {
        document.dispatchEvent(new CustomEvent('yf:require-auth'));
        return;
    }
    if (st) { const same = st.opener === opener; close(false); if (same) return; }
    const share = opener.hasAttribute('data-share-title');
    const d = opener.dataset;
    const target: Title | null = share ? null : (d.mediaType === 'movie' || d.mediaType === 'tv') && Number(d.tmdbId) > 0
        ? { type: d.mediaType, id: Number(d.tmdbId), title: d.title || '', sub: '', image: tmdbPath(d.image) }
        : null;
    if (!share && !target) return;
    const s: State = {
        mode: share ? 'share' : 'sendTo', opener, sheet: !isDesktop(),
        anchor: (d.anchor && document.querySelector<HTMLElement>(d.anchor)) || opener,
        conv: Number(d.conv) || 0, convTitle: d.convTitle || '', q: '', tab: 'all', hits: [], pick: null,
        target, dests: [], dest: null, loading: !share, sending: false, error: null,
    };
    st = s;
    shell.classList.toggle('is-sheet', s.sheet);
    shell.setAttribute('aria-label', share ? `Compartir un título en ${s.convTitle}` : `Enviar ${target!.title} a una conversación`);
    shell.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (s.sheet) document.body.style.overflow = 'hidden';
    opener.setAttribute('aria-expanded', 'true');
    renderAll(s);
    place();
    shell.querySelector<HTMLElement>('[data-ck-q]')?.focus();
    if (!share) void loadDests(s);
}

async function loadDests(s: State) {
    let ok = false;
    try {
        const res = await fetch('/api/social/messages/targets', { headers: { Accept: 'application/json' } });
        const d = await res.json();
        if (res.ok && d.ok) {
            s.dests = [
                ...(d.convs as ConvSummary[]).map((c) => ({ key: `c${c.id}`, conv: c })),
                ...(d.friends as PersonCard[]).map((f) => ({ key: `f${f.handle}`, friend: f })),
            ];
            ok = true;
        }
    } catch { /* sin red */ }
    if (st !== s) return;
    s.loading = false;
    if (!ok) s.error = 'No se han podido cargar tus conversaciones. Cierra y vuelve a intentarlo.';
    repaint(s);
    place();
}

function close(restoreFocus = true) {
    if (!st || !shell) return;
    const s = st;
    st = null;
    shell.hidden = true;
    shell.innerHTML = '';
    shell.style.left = shell.style.top = shell.style.bottom = shell.style.maxHeight = '';
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    s.opener.setAttribute('aria-expanded', 'false');
    const back = s.anchor.isConnected && s.anchor.offsetParent !== null ? s.anchor : s.opener;
    if (restoreFocus && back.isConnected) back.focus();
}

// ---- Buscar (compartir) ------------------------------------------------------------------------
let searchTimer = 0;
let searchSeq = 0;
function search(s: State) {
    window.clearTimeout(searchTimer);
    if (s.q.trim().length < 2) { s.hits = []; s.loading = false; repaint(s); return; }
    s.loading = true;
    searchTimer = window.setTimeout(async () => {
        const mine = ++searchSeq;
        try {
            const res = await fetch(`/api/search/multi?q=${encodeURIComponent(s.q.trim())}`, { headers: { Accept: 'application/json' } });
            const d = await res.json();
            if (mine !== searchSeq || st !== s) return;
            s.hits = (d.items ?? [])
                .filter((it: any) => it.media_type === 'movie' || it.media_type === 'tv')
                .map((it: any) => ({ type: it.media_type, id: it.id, title: it.title, sub: it.subtitle || '', image: it.poster_path ?? null }));
        } catch { s.hits = []; }
        s.loading = false;
        repaint(s);
    }, 300);
}

// ---- Enviar ------------------------------------------------------------------------------------
const ERR: Record<string, string> = {
    rate: 'Vas muy rápido. Espera un momento.',
    read_only: 'Ya no puedes escribir en esa conversación.',
    not_friends: 'Solo puedes escribir a tus amigos.',
    card: 'No hemos encontrado ese título. Prueba con otro.',
};

async function send() {
    const s = st;
    if (!s || s.sending) return;
    const title = s.mode === 'share' ? s.pick : s.target;
    const dest = s.dests.find((x) => x.key === s.dest);
    if (!title || (s.mode === 'sendTo' && !dest)) return;
    const body = shell?.querySelector<HTMLTextAreaElement>('[data-ck-msg]')?.value.trim() ?? '';
    const card = { type: 'title', mediaType: title.type, tmdbId: title.id };
    s.sending = true; s.error = null;
    part('[data-ck-foot]', footHtml(s));
    let res: Response | null = null;
    let d: any = null;
    try {
        const url = s.mode === 'share' ? `/api/social/messages/${s.conv}/messages` : '/api/social/messages/send-to';
        const payload = s.mode === 'share'
            ? { body, clientId: uuid(), card }
            : { body, clientId: uuid(), card, ...(dest!.conv ? { convId: dest!.conv.id } : { handle: dest!.friend!.handle }) };
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        d = await res.json();
    } catch { /* sin red */ }
    if (st !== s) return;
    s.sending = false;
    if (!res?.ok || !d?.ok) {
        s.error = ERR[d?.error] ?? 'No se ha podido enviar. Tu comentario sigue aquí; vuelve a intentarlo.';
        part('[data-ck-foot]', footHtml(s));
        return;
    }
    if (s.mode === 'share') {
        close(false);
        document.dispatchEvent(new CustomEvent<{ conv: number; message: ChatMessage }>('yf:ms-card-sent', { detail: { conv: s.conv, message: d.message } }));
        return;
    }
    const where = destName(s);
    const convId = d.convId as number;
    close();
    showToast(`Enviada a ${where}`, 'success', () => { location.href = `/mislistas/amigos/mensajes/${convId}`; }, 'Abrir chat');
}

// ---- Eventos -----------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
    const s = st;
    if (!s || !shell) return;
    const t = e.target as Element;
    if (t.closest('[data-send-to], [data-share-title]')) return; // lo atiende quien abre
    if (!shell.contains(t)) { if (t === backdrop || !t.closest('dialog')) close(false); return; }
    if (t.closest('[data-ck-close]')) { close(); return; }
    const tab = t.closest<HTMLElement>('[data-ck-tab]');
    if (tab) {
        s.tab = tab.dataset.ckTab as State['tab'];
        shell.querySelectorAll('[data-ck-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        part('[data-ck-list]', listHtml(s));
        return;
    }
    const row = t.closest<HTMLElement>('.rk-r');
    if (row) { pickRow(s, row); return; }
    if (t.closest('[data-ck-send]')) void send();
});

function pickRow(s: State, row: HTMLElement) {
    if (s.mode === 'share') {
        const h = s.hits[Number(row.dataset.hit)];
        if (h) s.pick = h;
    } else {
        s.dest = row.dataset.dest ?? null;
    }
    s.error = null;
    repaint(s);
    shell?.querySelector<HTMLElement>(`.rk-r[aria-checked="true"]`)?.focus();
}

document.addEventListener('input', (e) => {
    const s = st;
    const t = e.target as HTMLElement;
    if (!s || !shell?.contains(t) || !t.matches('[data-ck-q]')) return;
    s.q = (t as HTMLInputElement).value;
    if (s.mode === 'share') search(s); else part('[data-ck-list]', listHtml(s));
});

document.addEventListener('keydown', (e) => {
    const s = st;
    if (!s || !shell) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!shell.contains(e.target as Node)) return;
    const t = e.target as HTMLElement;
    if ((e.key === ' ' || e.key === 'Enter') && t.matches('.rk-r')) { e.preventDefault(); pickRow(s, t); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (t.matches('.rk-r') || t.matches('[data-ck-q]'))) {
        const rows = [...shell.querySelectorAll<HTMLElement>('.rk-r')];
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(t);
        rows[i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)].focus();
        return;
    }
    // Foco atrapado dentro del selector.
    if (e.key === 'Tab') {
        const els = [...shell.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}, true);

// Móvil con el teclado abierto: la hoja queda justo encima, con el botón a la vista.
window.visualViewport?.addEventListener('resize', () => {
    if (!st?.sheet || !shell) return;
    const vv = window.visualViewport!;
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    shell.style.bottom = kb > 120 ? `${kb}px` : '';
});
window.addEventListener('resize', () => { if (st && !st.sheet) place(); });
