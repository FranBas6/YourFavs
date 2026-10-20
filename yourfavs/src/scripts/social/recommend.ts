/**
 * Selector «Recomendar» (F4; handoff docs/design_handoff_social_f4 §5.1–5.2, §5.6).
 *
 * Dos modos:
 *   · «elegir amigo»: ya sabes QUÉ (ficha, actor, productora, ⊕ de una tarjeta) y eliges A QUIÉN,
 *     con multiselección (hasta 10), buscador en el cliente y «Recientes».
 *   · «elegir título»: estás en el perfil de un amigo (`data-to`) y eliges QUÉ, con la búsqueda
 *     de siempre (`/api/search/multi`). Las productoras se recomiendan desde su página.
 *
 * Se abre con cualquier `[data-recommend]` (data-target-type, data-target-id, data-title,
 * data-image o data-to). Desplegable anclado en escritorio y hoja inferior en móvil, como «Guardar
 * en…». Desde «Guardar en…» no se abre otra capa: el mismo popover cambia de contenido
 * (`window.yfRec.mountIn`, que llama SaveToPopover).
 *
 * Al enviar: se cierra y sale un toast con Deshacer (6 s), que retira la recomendación.
 */
import { avatarHtml, esc, firstName, icon } from '../../lib/social/ui';
import { recLeadHtml } from '../../lib/social/recUi';
import { showToast } from './toast';
import type { PersonCard, RecTarget } from '../../lib/social/types';

declare global {
    interface Window {
        yfRec?: {
            mountIn(host: HTMLElement, target: Target, back: () => void, sheet: boolean): void;
            unmount(): boolean;
            /** «Guardar en…» se cerró por su cuenta: se olvida el selector sin volver atrás. */
            forget(): void;
        };
    }
}

interface Target { type: RecTarget; id: number; title: string; image: string | null }
interface TitleHit { type: 'movie' | 'tv' | 'person'; id: number; title: string; sub: string; image: string | null }

const MAX_TO = 10;
const MSG_MAX = 140;
const KIND: Record<string, string> = { movie: 'Película', tv: 'Serie', person: 'Persona' };

const shell = document.getElementById('rk') as HTMLElement | null;
const backdrop = document.getElementById('rk-backdrop') as HTMLElement | null;

let st: {
    mode: 'friend' | 'title';
    host: HTMLElement;
    inSaveTo: boolean;
    sheet: boolean;
    back: (() => void) | null;
    opener: HTMLElement | null;
    target: Target | null;
    to: PersonCard | null;
    friends: PersonCard[];
    recent: string[];
    already: Set<string>;
    sentTargets: Set<string>;
    selected: string[];
    q: string;
    tab: 'all' | 'movie' | 'tv' | 'person';
    hits: TitleHit[];
    loading: boolean;
    error: boolean;
    sending: boolean;
} | null = null;

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

// -------------------------------------------------------------------------------------
// Pintar
// -------------------------------------------------------------------------------------
function headHtml(): string {
    if (!st) return '';
    const close = `<button type="button" class="rk-x" data-rk-close aria-label="Cerrar">${icon('x')}</button>`;
    const back = st.inSaveTo ? `<button type="button" class="rk-back" data-rk-back>${icon('chevron-left')}Volver a Guardar en…</button>` : '';
    const handle = st.sheet ? '<div class="rk-hd" aria-hidden="true"></div>' : '';
    if (st.mode === 'title') {
        // Hasta que llega el amigo (se pide al abrir), la cabecera va sin él.
        const to = st.to
            ? `<div class="rk-to">${avatarHtml(st.to, 26)}<b>${esc(firstName(st.to.name))}</b>${st.to.handle ? `<span>@${esc(st.to.handle)}</span>` : ''}</div>`
            : '';
        return `${handle}<div class="rk-h"><div class="rk-h-b"><div class="rk-k">Recomendar a</div>${to}</div>${close}</div>`;
    }
    const t = st.target;
    if (!t) return `${handle}<div class="rk-h"><div class="rk-h-b"><div class="rk-k">Recomendar</div></div>${close}</div>`;
    return `${handle}${back}<div class="rk-h">${recLeadHtml({ targetType: t.type, title: t.title, image: t.image }, 34)}<div class="rk-h-b"><div class="rk-k">Recomendar</div><b>${esc(t.title)}</b></div>${close}</div>`;
}

function friendRowHtml(p: PersonCard): string {
    const on = st!.selected.includes(p.id);
    const dis = st!.already.has(p.id);
    return `<div class="rk-r${on ? ' on' : ''}${dis ? ' dis' : ''}" role="checkbox" tabindex="${dis ? -1 : 0}" aria-checked="${on}"${dis ? ' aria-disabled="true"' : ''} data-uid="${esc(p.id)}">`
        + avatarHtml(p, 32)
        + `<div class="rk-tx"><b>${esc(p.name)}</b>${p.handle ? `<span>@${esc(p.handle)}</span>` : ''}</div>`
        + (dis ? `<span class="rk-already">${icon('clock')}Ya se la recomendaste</span>` : `<span class="rk-ck">${icon('check')}</span>`)
        + `</div>`;
}

function friendListHtml(): string {
    const s = st!;
    const q = s.q.trim().toLowerCase().replace(/^@/, '');
    const match = (p: PersonCard) => !q || p.name.toLowerCase().includes(q) || (p.handle ?? '').includes(q);
    if (q) {
        const found = s.friends.filter(match);
        if (!found.length) {
            return `<div class="rk-emp"><h4>Ningún amigo coincide con «${esc(s.q.trim())}»</h4>`
                + `<p>Solo puedes recomendar a tus amigos. Si buscas a otra persona, añádela primero.</p>`
                + `<a class="pf-btn sm" href="/mislistas/amigos">${icon('user-plus')}Buscar personas</a></div>`;
        }
        return `<div class="rk-kk">Tus amigos · ${found.length}</div>` + found.map(friendRowHtml).join('');
    }
    const recent = s.recent.map((id) => s.friends.find((f) => f.id === id)).filter((p): p is PersonCard => Boolean(p));
    let html = '';
    if (recent.length && s.friends.length > 3) {
        html += `<div class="rk-kk">Recientes<span>a quien más recomiendas</span></div>` + recent.map(friendRowHtml).join('');
    }
    html += `<div class="rk-kk">${recent.length && s.friends.length > 3 ? 'Todos' : 'Tus amigos'} · ${s.friends.length}</div>`
        + s.friends.map(friendRowHtml).join('');
    if (s.friends.every((f) => s.already.has(f.id))) {
        html += `<p class="rk-note">Ya se la has recomendado a todos tus amigos. Cuando respondan, podrás volver a hacerlo.</p>`;
    }
    return html;
}

function titleRowHtml(h: TitleHit, i: number): string {
    const sel = st!.target && st!.target.type === h.type && st!.target.id === h.id;
    const dis = st!.sentTargets.has(`${h.type}:${h.id}`);
    return `<div class="rk-r rad${sel ? ' on' : ''}${dis ? ' dis' : ''}" role="radio" tabindex="${dis ? -1 : 0}" aria-checked="${!!sel}"${dis ? ' aria-disabled="true"' : ''} data-hit="${i}">`
        + recLeadHtml({ targetType: h.type, title: h.title, image: h.image }, 30)
        + `<div class="rk-tx"><b>${esc(h.title)}</b><span class="is-p">${esc([KIND[h.type], h.sub].filter(Boolean).join(' · '))}</span></div>`
        + (dis ? `<span class="rk-already">${icon('clock')}Ya se la recomendaste</span>` : `<span class="rk-ck">${icon('check')}</span>`)
        + `</div>`;
}

function titleListHtml(): string {
    const s = st!;
    if (s.q.trim().length < 2) return `<p class="rk-note">Escribe el título de una película o serie, o el nombre de una persona.</p>`;
    if (s.loading && !s.hits.length) return `<p class="rk-note">Buscando…</p>`;
    const hits = s.hits.map((h, i) => ({ h, i })).filter(({ h }) => s.tab === 'all' || h.type === s.tab);
    if (!hits.length) return `<p class="rk-note">Nada con «${esc(s.q.trim())}».</p>`;
    return hits.map(({ h, i }) => titleRowHtml(h, i)).join('');
}

function chipsHtml(): string {
    const s = st!;
    if (s.mode !== 'friend' || !s.selected.length) return '';
    return `<div class="rk-chips"><span class="rk-lb">Para</span>` + s.selected.map((id) => {
        const p = s.friends.find((f) => f.id === id);
        if (!p) return '';
        return `<span class="rk-chip">${avatarHtml(p, 22)}${esc(firstName(p.name))}<button type="button" data-rk-unpick="${esc(id)}" aria-label="Quitar a ${esc(firstName(p.name))}">${icon('x')}</button></span>`;
    }).join('') + `</div>`;
}

function footHtml(): string {
    const s = st!;
    const one = s.mode === 'title';
    const n = s.selected.length;
    const ready = one ? Boolean(s.target && s.to) : n > 0;
    const label = s.error ? 'Reintentar' : one ? `Enviar a ${firstName(s.to?.name ?? '')}` : n ? `Enviar a ${n}` : 'Enviar';
    const err = s.error ? `<div class="rk-err" role="alert">${icon('wifi-off')}<span><b>No se ha podido enviar.</b> Tu mensaje sigue aquí; vuelve a intentarlo.</span></div>` : '';
    const pv = `<span class="rk-pv">${icon('eye-off')}No te diremos si ya ${one ? 'la tiene o la ha visto' : 'la tienen o la han visto'}.</span>`;
    return `${err}${s.error ? '' : pv}<button type="button" class="pf-btn pri" data-rk-send${ready && !s.sending ? '' : ' disabled'}>${icon(s.error ? 'undo-2' : 'send')}${esc(label)}</button>`;
}

function emptyHtml(): string {
    return `<div class="rk-emp"><span class="rk-st">${icon('handshake')}</span><h4>Recomendar es solo entre amigos</h4>`
        + `<p>Cuando tengas amigos en YourFavs, podrás mandarles películas, series y personas desde aquí.</p>`
        + `<a class="pf-btn pri sm" href="/mislistas/amigos">${icon('users')}Ir a Amigos</a></div>`;
}

/** Pinta el selector entero (solo al abrir y al cambiar de modo; lo demás, por partes). */
function renderAll(focusSearch = true) {
    const s = st!;
    const h = s.host;
    // Aún cargando: los amigos (modo «elegir amigo») o el amigo (modo «elegir título»).
    if ((s.loading && !s.friends.length && s.mode === 'friend') || (s.mode === 'title' && !s.to)) {
        h.innerHTML = headHtml() + '<p class="rk-note">Cargando…</p>';
        return;
    }
    if (s.mode === 'friend' && !s.friends.length) {
        h.innerHTML = headHtml() + emptyHtml();
        return;
    }
    const tabs = s.mode === 'title'
        ? `<div class="rk-tabs" role="tablist" aria-label="Tipo">${(['all', 'movie', 'tv', 'person'] as const).map((t) =>
            `<button type="button" role="tab" aria-selected="${s.tab === t}" data-rk-tab="${t}">${{ all: 'Todo', movie: 'Películas', tv: 'Series', person: 'Personas' }[t]}</button>`).join('')}</div>`
        : '';
    const placeholder = s.mode === 'title' ? 'Buscar película, serie o persona' : 'Buscar amigo por nombre o @';
    h.innerHTML = headHtml()
        + `<div class="rk-s"><label class="rk-in">${icon('search')}<input type="search" data-rk-q placeholder="${placeholder}" autocomplete="off" spellcheck="false" aria-label="${placeholder}" value="${esc(s.q)}"></label>${tabs}</div>`
        + `<div class="rk-l" data-rk-list ${s.mode === 'title' ? 'role="radiogroup" aria-label="Resultados"' : 'role="group" aria-label="Tus amigos"'}>${s.mode === 'title' ? titleListHtml() : friendListHtml()}</div>`
        + `<div data-rk-chips>${chipsHtml()}</div>`
        + `<div class="rk-msg"><textarea data-rk-msg rows="2" maxlength="${MSG_MAX}" placeholder="Añade un mensaje (opcional)" aria-label="Mensaje opcional" aria-describedby="rk-cnt"></textarea>`
        + `<div class="rk-cnt"><span>Va igual a ${s.mode === 'title' ? esc(firstName(s.to?.name ?? '')) : 'todos'}</span><b id="rk-cnt">0/${MSG_MAX}</b><span class="sr-only" data-rk-cnt-live aria-live="polite"></span></div></div>`
        + `<div class="rk-f" data-rk-foot>${footHtml()}</div>`;
    if (focusSearch) h.querySelector<HTMLInputElement>('[data-rk-q]')?.focus();
}

const part = (sel: string, html: string) => { const el = st?.host.querySelector(sel); if (el) el.innerHTML = html; };
const repaintList = () => part('[data-rk-list]', st!.mode === 'title' ? titleListHtml() : friendListHtml());
const repaintChips = () => part('[data-rk-chips]', chipsHtml());
const repaintFoot = () => part('[data-rk-foot]', footHtml());

// -------------------------------------------------------------------------------------
// Abrir, colocar y cerrar
// -------------------------------------------------------------------------------------
function place(opener: HTMLElement | null) {
    if (!shell || !st || st.inSaveTo) return;
    if (st.sheet || !opener) {
        shell.style.left = ''; shell.style.top = '';
        return;
    }
    const r = opener.getBoundingClientRect();
    const w = shell.offsetWidth, h = shell.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 10);
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
    shell.style.setProperty('--rk-arrow', `${Math.min(Math.max(16, r.left + r.width / 2 - left - 6), w - 28)}px`);
    shell.classList.toggle('arrow-up', top > r.bottom);
}

async function loadFriends() {
    const s = st!;
    const t = s.target!;
    try {
        const res = await fetch(`/api/social/recommendations/friends?targetType=${t.type}&targetId=${t.id}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        if (st !== s) return;
        if (!res.ok || !d.ok) throw new Error();
        s.friends = d.friends; s.recent = d.recent; s.already = new Set(d.alreadySent);
    } catch {
        if (st !== s) return;
        s.friends = [];
    }
    s.loading = false;
    renderAll();
    place(s.opener);
}

async function loadFriend(handle: string) {
    const s = st!;
    try {
        const res = await fetch(`/api/social/recommendations/friends?to=${encodeURIComponent(handle)}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        if (st !== s) return;
        if (!res.ok || !d.ok) { close(); showToast('Solo puedes recomendar a tus amigos.', 'error'); return; }
        s.to = d.friend; s.sentTargets = new Set(d.sentTargets);
    } catch { close(); return; }
    s.loading = false;
    renderAll();
    place(s.opener);
}

function fresh(o: Partial<NonNullable<typeof st>> & Pick<NonNullable<typeof st>, 'mode' | 'host'>): NonNullable<typeof st> {
    return {
        inSaveTo: false, sheet: !isDesktop(), back: null, opener: null, target: null, to: null,
        friends: [], recent: [], already: new Set(), sentTargets: new Set(), selected: [], q: '', tab: 'all',
        hits: [], loading: true, error: false, sending: false, ...o,
    };
}

function openFrom(source: HTMLElement, anchor: HTMLElement = source) {
    const opener = source;
    if (!shell) return;
    if (!document.cookie.split('; ').some((c) => c.startsWith('has_session='))) {
        document.dispatchEvent(new CustomEvent('yf:require-auth'));
        return;
    }
    const to = opener.dataset.to;
    const type = opener.dataset.targetType as RecTarget | undefined;
    st = fresh({ mode: to ? 'title' : 'friend', host: shell, opener: anchor });
    if (!to) {
        if (!type || !opener.dataset.targetId) { st = null; return; }
        st.target = { type, id: Number(opener.dataset.targetId), title: opener.dataset.title || '', image: tmdbPath(opener.dataset.image) };
    }
    shell.classList.toggle('is-sheet', st.sheet);
    shell.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (st.sheet) document.body.style.overflow = 'hidden';
    shell.setAttribute('aria-label', to ? 'Recomendar a un amigo' : `Recomendar ${st.target!.title}`);
    anchor.setAttribute('aria-expanded', 'true');
    renderAll(false);
    place(anchor);
    if (to) loadFriend(to); else loadFriends();
}

function close() {
    if (!st) return;
    const s = st;
    st = null;
    if (s.inSaveTo) { s.back?.(); return; }
    if (shell) { shell.hidden = true; shell.innerHTML = ''; shell.classList.remove('is-typing'); }
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    s.opener?.setAttribute('aria-expanded', 'false');
    s.opener?.focus();
}

// Desde «Guardar en…»: el mismo popover cambia de contenido (handoff §5.2).
window.yfRec = {
    mountIn(host, target, back, sheet) {
        st = fresh({ mode: 'friend', host, inSaveTo: true, sheet, back, target: { ...target, image: tmdbPath(target.image) } });
        renderAll(false);
        loadFriends().then(() => host.querySelector<HTMLElement>('.rk-r:not(.dis)')?.focus());
    },
    /** Esc en «Guardar en…» con el selector dentro: vuelve atrás. true si estaba montado. */
    unmount() {
        if (!st?.inSaveTo) return false;
        const back = st.back;
        st = null;
        back?.();
        return true;
    },
    forget() {
        if (st?.inSaveTo) st = null;
    },
};

/** Ruta de TMDB («/abc.jpg») a partir de lo que traiga el disparador (ruta o URL entera). */
function tmdbPath(v: string | undefined | null): string | null {
    if (!v) return null;
    const m = v.match(/\/t\/p\/[a-z0-9]+(\/[\w.-]+)$/i);
    const p = m ? m[1] : v;
    return /^\/[\w.-]+$/.test(p) ? p : null;
}

// -------------------------------------------------------------------------------------
// Buscar títulos (modo «elegir título»)
// -------------------------------------------------------------------------------------
let searchTimer = 0;
let searchSeq = 0;
function searchTitles() {
    const s = st!;
    window.clearTimeout(searchTimer);
    if (s.q.trim().length < 2) { s.hits = []; repaintList(); return; }
    s.loading = true;
    searchTimer = window.setTimeout(async () => {
        const mine = ++searchSeq;
        try {
            const res = await fetch(`/api/search/multi?q=${encodeURIComponent(s.q.trim())}`, { headers: { Accept: 'application/json' } });
            const d = await res.json();
            if (mine !== searchSeq || st !== s) return;
            s.hits = (d.items ?? []).map((it: any) => ({ type: it.media_type, id: it.id, title: it.title, sub: it.subtitle || '', image: it.poster_path ?? null }));
        } catch { s.hits = []; }
        s.loading = false;
        repaintList();
    }, 300);
}

// -------------------------------------------------------------------------------------
// Enviar y Deshacer
// -------------------------------------------------------------------------------------
async function send() {
    const s = st!;
    if (s.sending) return;
    const target = s.target!;
    const toIds = s.mode === 'title' ? [s.to!.id] : s.selected;
    const message = (s.host.querySelector<HTMLTextAreaElement>('[data-rk-msg]')?.value ?? '').replace(/\s+/g, ' ').trim();
    s.sending = true; s.error = false; repaintFoot();
    let d: any = null;
    let res: Response | null = null;
    try {
        res = await fetch('/api/social/recommendations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetType: target.type, targetId: target.id, title: target.title, image: target.image, toIds, message }),
        });
        d = await res.json();
    } catch { /* sin red */ }
    if (st !== s) return;
    s.sending = false;
    if (!res?.ok || !d?.ok) {
        if (d?.error === 'all_skipped') { close(); showToast('Ya se la habías recomendado y aún no ha respondido.', 'error'); return; }
        if (d?.error === 'rate') { close(); showToast('Hoy ya has recomendado mucho. Vuelve a probar mañana.', 'error'); return; }
        s.error = true; repaintFoot();
        return;
    }
    const names = toIds.filter((id) => !d.skipped.includes(id))
        .map((id) => firstName((s.mode === 'title' ? [s.to!] : s.friends).find((f) => f.id === id)?.name ?? ''));
    const skipped = (d.skipped as string[]).map((id) => firstName(s.friends.find((f) => f.id === id)?.name ?? ''));
    const verb = target.type === 'movie' || target.type === 'tv' ? 'Recomendada a' : 'Recomendación enviada a';
    const who = names.length > 1 ? `${names[0]} y ${names.length - 1} más` : names[0];
    const extra = skipped.length ? ` ${skipped.join(', ')} ya la ${skipped.length > 1 ? 'tenían' : 'tenía'} pendiente de ti.` : '';
    const recId = d.recId as number;
    close();
    showToast(`${verb} ${who}.${extra}`, 'success', async () => {
        try {
            const r = await fetch(`/api/social/recommendations/${recId}`, { method: 'DELETE' });
            const x = await r.json();
            if (r.ok && x.ok) showToast('Recomendación retirada');
            else if (x.error === 'answered') showToast(`${names[0]} ya la ha respondido. No se puede retirar.`, 'error');
            else showToast('No se ha podido retirar.', 'error');
        } catch { showToast('No se ha podido retirar.', 'error'); }
    });
}

// -------------------------------------------------------------------------------------
// Eventos (delegados en el documento: el selector vive en #rk o dentro de «Guardar en…»)
// -------------------------------------------------------------------------------------
function inPicker(t: EventTarget | null): boolean {
    return Boolean(st && t instanceof Node && st.host.contains(t));
}

function toggleFriend(row: HTMLElement) {
    const s = st!;
    const id = row.dataset.uid!;
    if (row.getAttribute('aria-disabled') === 'true') return;
    if (s.selected.includes(id)) s.selected = s.selected.filter((x) => x !== id);
    else if (s.selected.length < MAX_TO) s.selected = [...s.selected, id];
    else { showToast(`Como mucho, ${MAX_TO} a la vez.`, 'error'); return; }
    row.classList.toggle('on', s.selected.includes(id));
    row.setAttribute('aria-checked', String(s.selected.includes(id)));
    s.error = false;
    repaintChips(); repaintFoot();
}

function pickTitle(row: HTMLElement) {
    const s = st!;
    if (row.getAttribute('aria-disabled') === 'true') return;
    const h = s.hits[Number(row.dataset.hit)];
    if (!h) return;
    s.target = { type: h.type, id: h.id, title: h.title, image: h.image };
    s.host.querySelectorAll<HTMLElement>('.rk-r.rad').forEach((r) => {
        const on = r === row;
        r.classList.toggle('on', on);
        r.setAttribute('aria-checked', String(on));
    });
    s.error = false;
    repaintFoot();
}

document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const opener = t.closest<HTMLElement>('[data-recommend]');
    if (opener && !inPicker(t)) {
        e.preventDefault();
        if (st && st.opener === opener) { close(); return; }
        if (st) close();
        // Desde un menú («Amigos ▾»): se cierra, y el selector se ancla (y devuelve el foco) a su botón.
        const menu = opener.closest<HTMLElement>('.pf-menu');
        const toggle = menu?.parentElement?.querySelector<HTMLElement>('[data-menu-toggle]');
        if (menu && toggle) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            openFrom(opener, toggle);
        } else {
            openFrom(opener);
        }
        return;
    }
    if (!st) return;
    if (!inPicker(t)) {
        if (!st.inSaveTo && t !== backdrop && shell?.contains(t)) return;
        if (!st.inSaveTo) close();
        return;
    }
    if (t.closest('[data-rk-close]')) { st.inSaveTo ? window.yfRec!.unmount() : close(); return; }
    if (t.closest('[data-rk-back]')) { window.yfRec!.unmount(); return; }
    const unpick = t.closest<HTMLElement>('[data-rk-unpick]');
    if (unpick) {
        const row = st.host.querySelector<HTMLElement>(`.rk-r[data-uid="${CSS.escape(unpick.dataset.rkUnpick!)}"]`);
        if (row) toggleFriend(row);
        else { st.selected = st.selected.filter((x) => x !== unpick.dataset.rkUnpick); repaintChips(); repaintFoot(); }
        return;
    }
    const tab = t.closest<HTMLElement>('[data-rk-tab]');
    if (tab) {
        st.tab = tab.dataset.rkTab as 'all';
        st.host.querySelectorAll('[data-rk-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        repaintList();
        return;
    }
    const row = t.closest<HTMLElement>('.rk-r');
    if (row) { st.mode === 'title' ? pickTitle(row) : toggleFriend(row); return; }
    if (t.closest('[data-rk-send]')) send();
});

document.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (!st || !inPicker(t)) return;
    if (t.matches('[data-rk-q]')) {
        st.q = (t as HTMLInputElement).value;
        if (st.mode === 'title') searchTitles(); else repaintList();
    } else if (t.matches('[data-rk-msg]')) {
        const ta = t as HTMLTextAreaElement;
        // Una línea de texto plano: sin saltos.
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n+/g, ' ');
        const n = ta.value.length;
        const cnt = st.host.querySelector('#rk-cnt');
        if (cnt) cnt.textContent = `${n}/${MSG_MAX}`;
        // Solo se anuncia al cruzar 120, 130 y 140.
        const live = st.host.querySelector('[data-rk-cnt-live]');
        if (live && (n === 120 || n === 130 || n === 140)) live.textContent = `${n} de ${MSG_MAX} caracteres`;
    }
});

document.addEventListener('keydown', (e) => {
    if (!st) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        st.inSaveTo ? window.yfRec!.unmount() : close();
        return;
    }
    if (!inPicker(e.target)) return;
    const t = e.target as HTMLElement;
    if ((e.key === ' ' || e.key === 'Enter') && t.matches('.rk-r')) {
        e.preventDefault();
        st.mode === 'title' ? pickTitle(t) : toggleFriend(t);
        return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (t.matches('.rk-r') || t.matches('[data-rk-q]'))) {
        const rows = [...st.host.querySelectorAll<HTMLElement>('.rk-r:not(.dis)')];
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(t);
        const next = i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
        rows[next].focus();
        return;
    }
    // Foco atrapado (con su propia capa; dentro de «Guardar en…» manda el de ese popover).
    if (e.key === 'Tab' && !st.inSaveTo) {
        const els = [...st.host.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, a[href], [tabindex="0"]')]
            .filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}, true);

backdrop?.addEventListener('click', () => close());

// Móvil con el teclado abierto: se pliegan buscador y lista y la hoja queda justo encima del
// teclado, con el mensaje y «Enviar» a la vista (handoff §5.1).
window.visualViewport?.addEventListener('resize', () => {
    if (!st || !st.sheet || !shell || st.inSaveTo) return;
    const vv = window.visualViewport!;
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    const typingMsg = document.activeElement?.matches('[data-rk-msg]') ?? false;
    shell.classList.toggle('is-typing', kb > 120 && typingMsg);
    shell.style.bottom = kb > 120 ? `${kb}px` : '';
});

// Desplazar la página con el desplegable abierto lo cierra (como «Guardar en…»); desplazar la
// lista de dentro, no.
window.addEventListener('scroll', (e) => {
    if (!st || st.sheet || st.inSaveTo) return;
    if (e.target instanceof Node && shell?.contains(e.target)) return;
    close();
}, true);
