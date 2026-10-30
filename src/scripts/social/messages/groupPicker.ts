/**
 * Selector de grupo (M2; handoff de mensajes §4.9), sobre el `.rk` de recomendar (F4): desplegable
 * anclado a su botón en escritorio y hoja inferior en móvil, con casillas, buscador, chips y pie
 * fijo con la barra de 10 casillas.
 *
 *   · «Nuevo grupo» (`[data-ms-newgroup]`): nombre (1–40) con foco al abrir, mínimo 2 amigos. Al
 *     crear se abre el grupo y el foco va al compositor.
 *   · «Añadir personas» (`[data-ms-addpeople]`, panel del grupo, solo admins): quien ya está sale
 *     deshabilitado con «Ya está en el grupo»; con el grupo lleno, todo deshabilitado y la nota.
 *
 * En los dos, solo TUS amigos (`/api/social/messages/candidates`); al llegar a 10 las filas sin
 * marcar pasan a «Grupo lleno», y quien está en 20 grupos sale con «Está en demasiados grupos».
 */
import { avatarHtml, esc, firstName, icon } from '../../../lib/social/ui';
import { GROUP_MAX, GROUP_NAME_MAX, gavHtml } from '../../../lib/social/chatView';
import { msgApi } from './api';
import { showToast } from '../toast';
import type { PersonCard } from '../../../lib/social/types';

interface Cand { person: PersonCard; inGroup: boolean; full: boolean }
interface State {
    mode: 'new' | 'add';
    conv: number | null;
    title: string;
    faces: PersonCard[];
    /** Personas que ya hay (contándote): 1 al crear. */
    count: number;
    q: string;
    people: Cand[];
    selected: string[];
    loading: boolean;
    sending: boolean;
    error: string | null;
    opener: HTMLElement | null;
    sheet: boolean;
}

const shell = document.getElementById('ms-gp');
const backdrop = document.getElementById('ms-gp-bd');
let st: State | null = null;

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
const room = (s: State) => Math.max(0, GROUP_MAX - s.count);
const nameOf = (s: State, id: string) => s.people.find((c) => c.person.id === id)?.person;

// ---- Pintar ----------------------------------------------------------------------------------
function headHtml(s: State): string {
    const close = `<button type="button" class="rk-x" data-gp-close aria-label="Cerrar">${icon('x')}</button>`;
    const handle = s.sheet ? '<div class="rk-hd" aria-hidden="true"></div>' : '';
    if (s.mode === 'new') {
        return `${handle}<div class="rk-h"><span class="rk-st">${icon('users')}</span><div class="rk-h-b"><div class="rk-k">Nuevo grupo</div><b>Solo con amigos tuyos</b></div>${close}</div>`;
    }
    return `${handle}<div class="rk-h">${gavHtml(s.faces, 34)}<div class="rk-h-b"><div class="rk-k">Añadir a</div><b>${esc(s.title)}</b></div>${close}</div>`;
}

function rowHtml(s: State, c: Cand): string {
    const p = c.person;
    const on = s.selected.includes(p.id);
    const dis: [string, string] | null = c.inGroup ? ['check', 'Ya está en el grupo']
        : !on && s.selected.length >= room(s) ? ['lock', 'Grupo lleno']
        : c.full ? ['lock', 'Está en demasiados grupos']
        : null;
    return `<div class="rk-r${on ? ' on' : ''}${dis ? ' dis' : ''}" role="checkbox" tabindex="${dis ? -1 : 0}" aria-checked="${on}"${dis ? ' aria-disabled="true"' : ''} data-uid="${esc(p.id)}">`
        + avatarHtml(p, 32)
        + `<div class="rk-tx"><b>${esc(p.name)}</b>${p.handle ? `<span>@${esc(p.handle)}</span>` : ''}</div>`
        + (dis ? `<span class="rk-already">${icon(dis[0])}${dis[1]}</span>` : `<span class="rk-ck">${icon('check')}</span>`)
        + `</div>`;
}

function listHtml(s: State): string {
    if (s.loading) return `<p class="rk-note">Cargando…</p>`;
    if (!s.people.length) return `<p class="rk-note">Todavía no tienes amigos. Los grupos son solo con amigos tuyos.</p>`;
    const q = s.q.trim().toLowerCase().replace(/^@/, '');
    const found = s.people.filter((c) => !q || c.person.name.toLowerCase().includes(q) || (c.person.handle ?? '').includes(q));
    if (!found.length) return `<p class="rk-note">Ningún amigo coincide con «${esc(s.q.trim())}».</p>`;
    const head = s.mode === 'new'
        ? `<div class="rk-kk">Tus amigos · ${s.people.length}<span>elige al menos 2</span></div>`
        : `<div class="rk-kk">Tus amigos<span>solo puedes añadir a amigos tuyos</span></div>`;
    return head + found.map((c) => rowHtml(s, c)).join('');
}

function chipsHtml(s: State): string {
    if (!s.selected.length) return '';
    return `<div class="rk-chips"><span class="rk-lb">${s.mode === 'new' ? 'Con' : 'Añadir'}</span>` + s.selected.map((id) => {
        const p = nameOf(s, id);
        if (!p) return '';
        const f = firstName(p.name);
        return `<span class="rk-chip">${avatarHtml(p, 22)}${esc(f)}<button type="button" data-gp-unpick="${esc(id)}" aria-label="Quitar a ${esc(f)}">${icon('x')}</button></span>`;
    }).join('') + `</div>`;
}

function meterHtml(s: State): string {
    const n = s.selected.length;
    const total = s.count + n;
    const cells = Array.from({ length: GROUP_MAX }, (_, i) => `<i class="${i < s.count ? 'me' : i < total ? 'on' : ''}"></i>`).join('');
    return `<div class="meter" aria-label="${total} de ${GROUP_MAX} personas"><div class="bar" aria-hidden="true">${cells}</div><span>${total} de ${GROUP_MAX} <small>contándote</small></span></div>`;
}

function footHtml(s: State): string {
    const n = s.selected.length;
    const err = s.error ? `<div class="rk-err" role="alert">${icon('circle-alert')}<span>${esc(s.error)}</span></div>` : '';
    if (s.mode === 'new') {
        const name = (shell?.querySelector<HTMLInputElement>('[data-gp-name]')?.value ?? '').trim();
        const ready = Boolean(name) && n >= 2 && !s.sending;
        return `${err}${meterHtml(s)}<button type="button" class="pf-btn pri" data-gp-go${ready ? '' : ' disabled'}>${icon('users')}Crear grupo</button>`;
    }
    const ready = n >= 1 && room(s) > 0 && !s.sending;
    return `${err}${meterHtml(s)}<button type="button" class="pf-btn pri" data-gp-go${ready ? '' : ' disabled'}>${icon('user-plus')}${n ? `Añadir a ${n}` : 'Añadir'}</button>`
        + `<span class="rk-pv">${icon('info')}Verán los mensajes desde que entren, no los de antes.</span>`;
}

function renderAll() {
    const s = st;
    if (!s || !shell) return;
    const name = s.mode === 'new'
        ? `<div class="rk-s is-name"><label class="gp-l" for="ms-gp-name">Nombre del grupo</label>`
            + `<span class="rk-in"><input id="ms-gp-name" type="text" maxlength="${GROUP_NAME_MAX}" autocomplete="off" data-gp-name placeholder="Por ejemplo, Viernes de pelis">`
            + `<b class="gp-c" data-gp-name-n>0/${GROUP_NAME_MAX}</b></span></div>`
        : '';
    const fullNote = s.mode === 'add' && room(s) === 0
        ? `<div class="rk-note2">${icon('info')}<span><b>El grupo está completo.</b> Caben ${GROUP_MAX} personas. Para añadir a alguien, otra persona tiene que salir.</span></div>`
        : '';
    shell.innerHTML = headHtml(s) + name
        + `<div class="rk-s"><label class="rk-in">${icon('search')}<input type="search" data-gp-q placeholder="Buscar amigo por nombre o @" aria-label="Buscar amigo por nombre o @" autocomplete="off" spellcheck="false"></label></div>`
        + fullNote
        + `<div class="rk-l" data-gp-list role="group" aria-label="Tus amigos">${listHtml(s)}</div>`
        + `<div data-gp-chips>${chipsHtml(s)}</div>`
        + `<div class="rk-f" data-gp-foot>${footHtml(s)}</div>`;
}
const part = (sel: string, html: string) => { const el = shell?.querySelector(sel); if (el) el.innerHTML = html; };
const repaint = () => {
    if (!st) return;
    part('[data-gp-list]', listHtml(st));
    part('[data-gp-chips]', chipsHtml(st));
    part('[data-gp-foot]', footHtml(st));
};

// ---- Abrir, colocar y cerrar ------------------------------------------------------------------
function place() {
    if (!shell || !st) return;
    if (st.sheet || !st.opener) { shell.style.left = ''; shell.style.top = ''; return; }
    const r = st.opener.getBoundingClientRect();
    const w = shell.offsetWidth;
    const h = shell.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 10);
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
}

async function open(opener: HTMLElement, mode: 'new' | 'add') {
    if (!shell) return;
    if (st) close(false);
    let faces: PersonCard[] = [];
    try { faces = JSON.parse(opener.dataset.faces || '[]'); } catch { /* sin caras */ }
    st = {
        mode, conv: mode === 'add' ? Number(opener.dataset.conv) || null : null,
        title: opener.dataset.title || '', faces,
        count: mode === 'add' ? Number(opener.dataset.count) || 1 : 1,
        q: '', people: [], selected: [], loading: true, sending: false, error: null, opener, sheet: !isDesktop(),
    };
    shell.classList.toggle('is-sheet', st.sheet);
    shell.setAttribute('aria-label', mode === 'new' ? 'Nuevo grupo' : `Añadir personas a ${st.title}`);
    shell.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (st.sheet) document.body.style.overflow = 'hidden';
    opener.setAttribute('aria-expanded', 'true');
    renderAll();
    place();
    (shell.querySelector<HTMLElement>(mode === 'new' ? '[data-gp-name]' : '[data-gp-q]'))?.focus();
    const s = st;
    const r = await msgApi.candidates(s.conv ?? undefined);
    if (st !== s) return;
    s.loading = false;
    s.people = r.ok ? r.data.people : [];
    if (!r.ok) s.error = 'No se han podido cargar tus amigos. Cierra y vuelve a intentarlo.';
    repaint();
    place();
}

function close(restoreFocus = true) {
    if (!st || !shell) return;
    const s = st;
    st = null;
    shell.hidden = true;
    shell.innerHTML = '';
    shell.style.bottom = '';
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    s.opener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && s.opener?.isConnected) s.opener.focus();
}

// ---- Elegir y enviar ---------------------------------------------------------------------------
function toggle(row: HTMLElement) {
    const s = st;
    if (!s || row.getAttribute('aria-disabled') === 'true') return;
    const id = row.dataset.uid!;
    if (s.selected.includes(id)) s.selected = s.selected.filter((x) => x !== id);
    else if (s.selected.length < room(s)) s.selected = [...s.selected, id];
    s.error = null;
    const focusId = id;
    repaint();
    shell?.querySelector<HTMLElement>(`.rk-r[data-uid="${CSS.escape(focusId)}"]`)?.focus();
}

const CREATE_ERR: Record<string, string> = {
    name: 'Ponle al grupo un nombre de 1 a 40 caracteres.',
    too_few: 'Elige al menos 2 amigos.',
    too_many: 'Caben 10 personas contándote.',
    not_friends: 'Alguien de la lista ya no es tu amigo. Revisa la selección.',
    cap: 'Ya estás en 20 grupos. Sal de alguno para crear otro.',
    rate: 'Hoy has empezado muchas conversaciones. Vuelve a probar mañana.',
};
const ADD_ERR: Record<string, string> = {
    full: 'El grupo está completo.',
    not_admin: 'Ya no administras este grupo.',
    not_friends: 'Alguien de la lista ya no es tu amigo. Revisa la selección.',
    none: 'Ya no estás en este grupo.',
};

function skippedText(s: State, ids: string[]): string {
    const names = ids.map((id) => firstName(nameOf(s, id)?.name ?? '')).filter(Boolean);
    if (!names.length) return '';
    return names.length === 1
        ? `${names[0]} está en demasiados grupos y no se ha añadido.`
        : `${names.join(', ')} están en demasiados grupos y no se han añadido.`;
}

async function go() {
    const s = st;
    if (!s || s.sending) return;
    s.sending = true;
    s.error = null;
    part('[data-gp-foot]', footHtml(s));
    if (s.mode === 'new') {
        const name = (shell?.querySelector<HTMLInputElement>('[data-gp-name]')?.value ?? '').trim();
        const r = await msgApi.createGroup(name, s.selected);
        if (st !== s) return;
        if (r.ok) {
            // La conversación nueva se abre con el foco en el compositor (chat.ts) y, si alguien se
            // quedó fuera, el aviso sale allí (rail.ts).
            try {
                sessionStorage.setItem('yf:ms-focus', '1');
                const skip = skippedText(s, r.data.skipped ?? []);
                if (skip) sessionStorage.setItem('yf:ms-flash', skip);
            } catch { /* sin almacenamiento */ }
            location.href = `/mislistas/amigos/mensajes/${r.data.id}`;
            return;
        }
        s.sending = false;
        s.error = (r.data.error && CREATE_ERR[r.data.error]) || 'No se ha podido crear el grupo. Inténtalo otra vez.';
        if (r.data.error === 'too_few' && (r.data as { skipped?: string[] }).skipped?.length) {
            s.error = `${skippedText(s, (r.data as { skipped: string[] }).skipped)} Elige al menos 2 amigos.`;
        }
        part('[data-gp-foot]', footHtml(s));
        return;
    }
    const r = await msgApi.addMembers(s.conv!, s.selected);
    if (st !== s) return;
    if (r.ok) {
        const skip = skippedText(s, r.data.skipped ?? []);
        close();
        if (skip) showToast(skip, 'error');
        // La conversación lo trae en el acto: su mensaje de sistema y el panel con la gente nueva.
        document.dispatchEvent(new CustomEvent('yf:ms-chat-refresh'));
        document.dispatchEvent(new CustomEvent('yf:ms-list-refresh'));
        return;
    }
    s.sending = false;
    s.error = (r.data.error && ADD_ERR[r.data.error]) || 'No se ha podido añadir. Inténtalo otra vez.';
    part('[data-gp-foot]', footHtml(s));
}

// ---- Eventos -----------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const opener = t.closest<HTMLElement>('[data-ms-newgroup], [data-ms-addpeople]');
    if (opener && !shell?.contains(opener)) {
        e.preventDefault();
        if (st?.opener === opener) { close(); return; }
        void open(opener, opener.hasAttribute('data-ms-newgroup') ? 'new' : 'add');
        return;
    }
    if (!st || !shell) return;
    if (!shell.contains(t)) { if (t === backdrop || !t.closest('dialog')) close(false); return; }
    if (t.closest('[data-gp-close]')) { close(); return; }
    const unpick = t.closest<HTMLElement>('[data-gp-unpick]');
    if (unpick) { st.selected = st.selected.filter((x) => x !== unpick.dataset.gpUnpick); repaint(); return; }
    const row = t.closest<HTMLElement>('.rk-r');
    if (row) { toggle(row); return; }
    if (t.closest('[data-gp-go]')) void go();
});

document.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (!st || !shell?.contains(t)) return;
    if (t.matches('[data-gp-q]')) {
        st.q = (t as HTMLInputElement).value;
        part('[data-gp-list]', listHtml(st));
    } else if (t.matches('[data-gp-name]')) {
        const v = (t as HTMLInputElement).value;
        const n = shell.querySelector('[data-gp-name-n]');
        if (n) n.textContent = `${v.length}/${GROUP_NAME_MAX}`;
        st.error = null;
        part('[data-gp-foot]', footHtml(st));
    }
});

document.addEventListener('keydown', (e) => {
    if (!st || !shell) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!shell.contains(e.target as Node)) return;
    const t = e.target as HTMLElement;
    if ((e.key === ' ' || e.key === 'Enter') && t.matches('.rk-r')) { e.preventDefault(); toggle(t); return; }
    // Enter en el nombre: a la lista (no crea a medias).
    if (e.key === 'Enter' && t.matches('[data-gp-name]')) { e.preventDefault(); shell.querySelector<HTMLElement>('[data-gp-q]')?.focus(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (t.matches('.rk-r') || t.matches('[data-gp-q]'))) {
        const rows = [...shell.querySelectorAll<HTMLElement>('.rk-r:not(.dis)')];
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(t);
        rows[i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)].focus();
        return;
    }
    // Foco atrapado dentro del selector.
    if (e.key === 'Tab') {
        const els = [...shell.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}, true);

// Móvil con el teclado abierto: la hoja queda justo encima, con «Crear grupo» a la vista.
window.visualViewport?.addEventListener('resize', () => {
    if (!st?.sheet || !shell) return;
    const vv = window.visualViewport!;
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    shell.style.bottom = kb > 120 ? `${kb}px` : '';
});
window.addEventListener('resize', () => { if (st && !st.sheet) place(); });
