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
 * En los dos, un comentario opcional que viaja como el texto del mismo mensaje (y que se puede
 * marcar como spoiler de ese mismo título).
 *
 *   · «Marcar como spoiler» (`[data-spoil-pick]`, desde el ＋ del chat; M4c): sugerencias («En esta
 *     conversación», «Lo que estás viendo») o búsqueda, y en series temporada y episodio (o «Toda la
 *     serie»). No envía nada: deja la marca en el compositor (`yf:ms-spoiler-set`).
 */
import { avatarHtml, esc, firstName, icon } from '../../../lib/social/ui';
import { MSG_MAX, gavHtml } from '../../../lib/social/chatView';
import { showToast } from '../toast';
import type { ChatMessage, ConvSummary, PersonCard, SpoilerRef } from '../../../lib/social/types';

interface Title { type: 'movie' | 'tv'; id: number; title: string; sub: string; image: string | null }
/** Destino de «Enviar a…»: una conversación o un amigo sin ella. */
type Dest = { key: string; conv: ConvSummary; friend?: undefined } | { key: string; friend: PersonCard; conv?: undefined };

interface State {
    mode: 'share' | 'sendTo' | 'spoiler';
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
    // spoiler
    sugg: { label: string; items: Title[] }[];
    eps: { seasons: Record<number, number>; last: { season: number; episode: number } | null } | null;
    season: number;
    /** 0 = «Toda la serie». */
    episode: number;
    /** Spoiler de una serie: primero el título y luego, solo, temporada y episodio. */
    step: 'title' | 'episode';
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
    if (s.mode === 'spoiler') {
        return `${handle}<div class="rk-h"><span class="rk-st ck-st is-sp">${icon('shield')}</span><div class="rk-h-b"><div class="rk-k">Marcar como spoiler</div><b data-ck-htitle>${esc(s.pick?.title ?? '¿De qué es?')}</b></div>${close}</div>`;
    }
    if (s.mode === 'share') {
        return `${handle}<div class="rk-h"><span class="rk-st ck-st">${icon('clapperboard')}</span><div class="rk-h-b"><div class="rk-k">Compartir en</div><b>${esc(s.convTitle)}</b></div>${close}</div>`;
    }
    const t = s.target!;
    return `${handle}<div class="rk-h">${posterHtml(t, 34)}<div class="rk-h-b"><div class="rk-k">Enviar a…</div><b>${esc(t.title)}</b></div>${close}</div>`;
}

function titleRowHtml(h: Title, i: number | string, on: boolean): string {
    return `<div class="rk-r rad${on ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${on}" ${typeof i === 'number' ? `data-hit="${i}"` : `data-sug="${i}"`}>`
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

const same = (a: Title | null, b: Title) => Boolean(a && a.type === b.type && a.id === b.id);

function listHtml(s: State): string {
    if (s.mode === 'spoiler' && s.q.trim().length < 2) {
        const groups = s.sugg.filter((g) => g.items.length);
        if (!groups.length) return `<p class="rk-note">${s.loading ? 'Cargando…' : 'Escribe el título de una película o serie.'}</p>`;
        return groups.map((g, gi) => `<div class="rk-kk">${esc(g.label)}</div>`
            + g.items.map((h, i) => titleRowHtml(h, `${gi}:${i}`, same(s.pick, h))).join('')).join('');
    }
    if (s.mode === 'share' || s.mode === 'spoiler') {
        if (s.q.trim().length < 2) return `<p class="rk-note">Escribe el título de una película o serie.</p>`;
        if (s.loading && !s.hits.length) return `<p class="rk-note">Buscando…</p>`;
        const hits = s.hits.map((h, i) => ({ h, i })).filter(({ h }) => s.tab === 'all' || h.type === s.tab);
        if (!hits.length) return `<p class="rk-note">Nada con «${esc(s.q.trim())}».</p>`;
        return hits.map(({ h, i }) => titleRowHtml(h, i, same(s.pick, h))).join('');
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

/** Lo elegido como spoiler (título + episodio, o la serie entera). null si aún falta algo. */
function spoilerOf(s: State): SpoilerRef | null {
    const t = s.pick;
    if (!t) return null;
    if (t.type === 'movie' || !s.episode) return t.type === 'tv' && !s.eps ? null : { mediaType: t.type, tmdbId: t.id, title: t.title };
    return { mediaType: 'tv', tmdbId: t.id, title: t.title, season: s.season, episode: s.episode };
}

/** Temporada y episodio (series), en píldoras; «Toda la serie» al final de las temporadas. */
function epsHtml(s: State): string {
    if (s.mode !== 'spoiler' || s.step !== 'episode' || s.pick?.type !== 'tv') return '';
    if (!s.eps) return `<p class="rk-note">Cargando temporadas…</p>`;
    const nums = Object.keys(s.eps.seasons).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    if (!nums.length) return `<p class="rk-note">TMDB no tiene sus episodios: se marcará la serie entera.</p>`;
    const chip = (on: boolean, attrs: string, label: string, aria: string) =>
        `<button type="button" class="chp${on ? ' on' : ''}" role="radio" aria-checked="${on}" aria-label="${esc(aria)}" ${attrs}>${esc(label)}</button>`;
    const seasons = nums.map((n) => chip(s.episode > 0 && s.season === n, `data-season="${n}"`, `T${n}`, `Temporada ${n}`)).join('')
        + chip(s.episode === 0, 'data-whole', 'Toda la serie', 'Toda la serie');
    const count = s.eps.seasons[s.season] ?? 0;
    const eps = s.episode > 0 && count
        ? `<span class="chp-l" id="ck-ep-l">Episodio</span><div class="chps" role="radiogroup" aria-labelledby="ck-ep-l">`
            + Array.from({ length: count }, (_, i) => chip(s.episode === i + 1, `data-ep="${i + 1}"`, `E${i + 1}`, `Episodio ${i + 1}`)).join('') + `</div>`
        : '';
    return `<span class="chp-l" id="ck-se-l">Temporada</span><div class="chps" role="radiogroup" aria-labelledby="ck-se-l">${seasons}</div>${eps}`;
}

function footHtml(s: State): string {
    if (s.mode === 'spoiler' && s.step === 'title' && s.pick?.type === 'tv') {
        // De vuelta en el paso 1 con una serie elegida: a temporada y episodio.
        return `<button type="button" class="pf-btn pri" data-ck-next>${icon('chevron-right')}Siguiente: temporada y episodio</button>`;
    }
    if (s.mode === 'spoiler') {
        const sp = spoilerOf(s);
        const what = sp ? [sp.title, sp.season ? `T${sp.season} E${sp.episode}` : ''].filter(Boolean).join(' ') : '';
        const sum = sp
            ? `<div class="sp-sum">${icon('shield')}<span>Se verá oculto para quien no haya visto <b>${esc(what)}</b>${sp.mediaType === 'tv' && !sp.season ? ' (la serie entera)' : ''}. A ti te sale siempre.</span></div>`
            : '';
        return `${sum}<button type="button" class="pf-btn pri" data-ck-send${sp ? '' : ' disabled'}>${icon('shield')}Marcar como spoiler</button>`;
    }
    const ready = s.mode === 'share' ? Boolean(s.pick) : Boolean(s.dest);
    const label = s.mode === 'share'
        ? (s.opener.dataset.group ? `Compartir en «${s.convTitle}»` : `Compartir con ${firstName(s.convTitle)}`)
        : ready ? `Enviar a ${destName(s)}` : 'Enviar';
    const err = s.error ? `<div class="rk-err" role="alert">${icon('wifi-off')}<span>${esc(s.error)}</span></div>` : '';
    return `${err}<button type="button" class="pf-btn pri" data-ck-send${ready && !s.sending ? '' : ' disabled'}>${icon(s.mode === 'share' ? 'clapperboard' : 'forward')}${esc(label)}</button>`;
}

function renderAll(s: State) {
    if (!shell) return;
    if (s.mode === 'spoiler' && s.step === 'episode') {
        shell.innerHTML = headHtml(s)
            + `<button type="button" class="rk-back" data-ck-back>${icon('chevron-left')}Cambiar título</button>`
            + `<div class="rk-s ck-eps" data-ck-eps>${epsHtml(s)}</div>`
            + `<div class="rk-f" data-ck-foot>${footHtml(s)}</div>`;
        return;
    }
    const tabs = s.mode !== 'sendTo'
        ? `<div class="rk-tabs" role="tablist" aria-label="Tipo">${(['all', 'movie', 'tv'] as const).map((t) =>
            `<button type="button" role="tab" aria-selected="${s.tab === t}" data-ck-tab="${t}">${{ all: 'Todo', movie: 'Películas', tv: 'Series' }[t]}</button>`).join('')}</div>`
        : '';
    const placeholder = s.mode === 'sendTo' ? 'Buscar conversación o amigo' : 'Buscar película o serie';
    // El comentario de una tarjeta se puede marcar como spoiler de ese mismo título (la película, o
    // la serie entera): se ve oculto para quien no la haya visto y la tarjeta se ve completa.
    const msg = s.mode === 'spoiler' ? ''
        : `<div class="rk-msg"><textarea data-ck-msg rows="2" maxlength="${MSG_MAX}" placeholder="Añade un comentario (opcional)" aria-label="Comentario opcional"></textarea>`
            + `<label class="ck-sp"><input type="checkbox" data-ck-sp>${icon('shield')}<span>El comentario es spoiler de este título</span></label></div>`;
    shell.innerHTML = headHtml(s)
        + `<div class="rk-s"><label class="rk-in">${icon('search')}<input type="search" data-ck-q placeholder="${placeholder}" autocomplete="off" spellcheck="false" aria-label="${placeholder}" value="${esc(s.q)}"></label>${tabs}</div>`
        + `<div class="rk-l" data-ck-list role="radiogroup" aria-label="${s.mode === 'sendTo' ? 'Conversaciones' : 'Resultados'}">${listHtml(s)}</div>`
        + msg
        + `<div class="rk-f" data-ck-foot>${footHtml(s)}</div>`;
}

const part = (sel: string, html: string) => { const el = shell?.querySelector(sel); if (el) el.innerHTML = html; };
const repaint = (s: State) => {
    part('[data-ck-list]', listHtml(s));
    part('[data-ck-eps]', epsHtml(s));
    part('[data-ck-foot]', footHtml(s));
    const h = shell?.querySelector('[data-ck-htitle]');
    if (h && s.mode === 'spoiler') h.textContent = s.pick?.title ?? '¿De qué es?';
};

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
    const up = st.mode !== 'sendTo' || (below < 420 && above > below);
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
    const mode: State['mode'] = opener.hasAttribute('data-share-title') ? 'share' : opener.hasAttribute('data-spoil-pick') ? 'spoiler' : 'sendTo';
    const d = opener.dataset;
    const target: Title | null = mode !== 'sendTo' ? null : (d.mediaType === 'movie' || d.mediaType === 'tv') && Number(d.tmdbId) > 0
        ? { type: d.mediaType, id: Number(d.tmdbId), title: d.title || '', sub: '', image: tmdbPath(d.image) }
        : null;
    if (mode === 'sendTo' && !target) return;
    const s: State = {
        mode, opener, sheet: !isDesktop(),
        anchor: (d.anchor && document.querySelector<HTMLElement>(d.anchor)) || opener,
        conv: Number(d.conv) || 0, convTitle: d.convTitle || '', q: '', tab: 'all', hits: [], pick: null,
        target, dests: [], dest: null, sugg: [], eps: null, season: 1, episode: 1, step: 'title',
        loading: mode !== 'share', sending: false, error: null,
    };
    st = s;
    shell.classList.toggle('is-sheet', s.sheet);
    shell.setAttribute('aria-label', mode === 'share' ? `Compartir un título en ${s.convTitle}`
        : mode === 'spoiler' ? 'Marcar como spoiler' : `Enviar ${target!.title} a una conversación`);
    shell.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (s.sheet) document.body.style.overflow = 'hidden';
    opener.setAttribute('aria-expanded', 'true');
    renderAll(s);
    place();
    shell.querySelector<HTMLElement>('[data-ck-q]')?.focus();
    if (mode === 'sendTo') void loadDests(s);
    if (mode === 'spoiler') void loadSuggest(s);
}

async function loadSuggest(s: State) {
    try {
        const res = await fetch(`/api/social/messages/spoiler-suggest?conv=${s.conv}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        if (res.ok && d.ok) {
            s.sugg = [{ label: 'En esta conversación', items: d.inChat }, { label: 'Lo que estás viendo', items: d.watching }];
        }
    } catch { /* sin sugerencias: queda el buscador */ }
    if (st !== s) return;
    s.loading = false;
    repaint(s);
    place();
}

/** Serie elegida: sus temporadas y, marcado, el episodio siguiente al tuyo (o T1 E1). */
async function loadEps(s: State, t: Title) {
    s.eps = null;
    let eps: State['eps'] = { seasons: {}, last: null };
    try {
        const res = await fetch(`/api/social/messages/series-episodes?id=${t.id}`, { headers: { Accept: 'application/json' } });
        const d = await res.json();
        if (res.ok && d.ok) eps = { seasons: d.seasons ?? {}, last: d.last ?? null };
    } catch { /* sin episodios: la serie entera */ }
    if (st !== s || s.pick !== t) return;
    s.eps = eps;
    const nums = Object.keys(eps.seasons).map(Number).filter((n) => n > 0);
    if (!nums.length) { s.episode = 0; }
    else if (eps.last) {
        const inSeason = eps.seasons[eps.last.season] ?? 0;
        if (eps.last.episode < inSeason) { s.season = eps.last.season; s.episode = eps.last.episode + 1; }
        else if (eps.seasons[eps.last.season + 1]) { s.season = eps.last.season + 1; s.episode = 1; }
        else { s.season = eps.last.season; s.episode = Math.max(1, eps.last.episode); }
    } else { s.season = Math.min(...nums); s.episode = 1; }
    repaint(s);
    place();
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
    if (s.mode === 'spoiler') {
        const sp = spoilerOf(s);
        if (!sp) return;
        close(false);
        document.dispatchEvent(new CustomEvent<{ conv: number; spoiler: SpoilerRef }>('yf:ms-spoiler-set', { detail: { conv: s.conv, spoiler: sp } }));
        return;
    }
    const title = s.mode === 'share' ? s.pick : s.target;
    const dest = s.dests.find((x) => x.key === s.dest);
    if (!title || (s.mode === 'sendTo' && !dest)) return;
    const body = shell?.querySelector<HTMLTextAreaElement>('[data-ck-msg]')?.value.trim() ?? '';
    const card = { type: 'title', mediaType: title.type, tmdbId: title.id };
    const asSpoiler = Boolean(body && shell?.querySelector<HTMLInputElement>('[data-ck-sp]')?.checked);
    const spoiler: SpoilerRef | null = asSpoiler ? { mediaType: title.type, tmdbId: title.id, title: title.title } : null;
    s.sending = true; s.error = null;
    part('[data-ck-foot]', footHtml(s));
    let res: Response | null = null;
    let d: any = null;
    try {
        const url = s.mode === 'share' ? `/api/social/messages/${s.conv}/messages` : '/api/social/messages/send-to';
        const payload = s.mode === 'share'
            ? { body, clientId: uuid(), card, spoiler }
            : { body, clientId: uuid(), card, spoiler, ...(dest!.conv ? { convId: dest!.conv.id } : { handle: dest!.friend!.handle }) };
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
    if (t.closest('[data-send-to], [data-share-title], [data-spoil-pick]')) return; // lo atiende quien abre
    if (!shell.contains(t)) { if (t === backdrop || !t.closest('dialog')) close(false); return; }
    if (t.closest('[data-ck-close]')) { close(); return; }
    if (t.closest('[data-ck-next]') && s.pick) {
        s.step = 'episode';
        renderAll(s);
        place();
        (shell.querySelector<HTMLElement>('.chp.on') ?? shell.querySelector<HTMLElement>('[data-ck-back]'))?.focus();
        return;
    }
    if (t.closest('[data-ck-back]')) {
        s.step = 'title';
        renderAll(s);
        place();
        shell.querySelector<HTMLElement>('.rk-r[aria-checked="true"]')?.focus();
        return;
    }
    const tab = t.closest<HTMLElement>('[data-ck-tab]');
    if (tab) {
        s.tab = tab.dataset.ckTab as State['tab'];
        shell.querySelectorAll('[data-ck-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        part('[data-ck-list]', listHtml(s));
        return;
    }
    const row = t.closest<HTMLElement>('.rk-r');
    if (row) { pickRow(s, row); return; }
    const chp = t.closest<HTMLElement>('.chp');
    if (chp) {
        if (chp.dataset.season) { s.season = Number(chp.dataset.season); s.episode = 1; }
        else if (chp.dataset.ep) s.episode = Number(chp.dataset.ep);
        else if (chp.hasAttribute('data-whole')) s.episode = 0;
        part('[data-ck-eps]', epsHtml(s));
        part('[data-ck-foot]', footHtml(s));
        shell.querySelector<HTMLElement>(chp.dataset.ep ? `[data-ep="${s.episode}"]` : chp.dataset.season ? `[data-season="${s.season}"]` : '[data-whole]')?.focus();
        return;
    }
    if (t.closest('[data-ck-send]')) void send();
});

function pickRow(s: State, row: HTMLElement) {
    if (s.mode === 'share' || s.mode === 'spoiler') {
        const sug = row.dataset.sug?.split(':').map(Number);
        const h = sug ? s.sugg[sug[0]]?.items[sug[1]] : s.hits[Number(row.dataset.hit)];
        if (h && s.mode === 'spoiler' && h.type === 'tv') {
            // Serie: al paso de temporada y episodio, con todo el sitio para las píldoras.
            if (!same(s.pick, h)) { s.pick = h; void loadEps(s, h); }
            s.step = 'episode';
            s.error = null;
            renderAll(s);
            place();
            (shell?.querySelector<HTMLElement>('.chp.on') ?? shell?.querySelector<HTMLElement>('[data-ck-back]'))?.focus();
            return;
        }
        if (h && !same(s.pick, h)) s.pick = h;
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
    if (s.mode === 'sendTo') part('[data-ck-list]', listHtml(s)); else search(s);
});

document.addEventListener('keydown', (e) => {
    const s = st;
    if (!s || !shell) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!shell.contains(e.target as Node)) return;
    const t = e.target as HTMLElement;
    if ((e.key === ' ' || e.key === 'Enter') && t.matches('.rk-r')) { e.preventDefault(); pickRow(s, t); return; }
    // Píldoras de temporada y episodio: ← → entre ellas.
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && t.matches('.chp')) {
        const row = [...(t.parentElement?.querySelectorAll<HTMLElement>('.chp') ?? [])];
        const i = row.indexOf(t);
        e.preventDefault();
        row[e.key === 'ArrowRight' ? Math.min(i + 1, row.length - 1) : Math.max(i - 1, 0)]?.focus();
        return;
    }
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
