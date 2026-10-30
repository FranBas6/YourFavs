/**
 * Selector de día y hora de «Plan para verla» (Mensajes M5; handoff M5 §3.2), sobre el `.rk`:
 * anclado al ＋ en escritorio y hoja inferior en móvil. Siempre con el título ya puesto: lo abre
 * el ＋ (tras elegir título en `cardPick`), «Quedar para verla» de una tarjeta y «¿Qué vemos?».
 *
 *   · Día: Hoy · Mañana · el próximo sábado y domingo (sin repetir) · Otra fecha (un mes en línea en
 *     escritorio; el selector nativo en móvil). Nada antes de hoy, en hora de Madrid.
 *   · Hora, opcional: Sin hora · 18:00 · 19:30 · 21:00 · 21:30 · 22:00 · Otra (nativo, de 15 en 15).
 *     Hoy, las horas pasadas no se pueden elegir.
 *   · Nota, opcional, 80 caracteres.
 *   · Modo «cambiar» (quien lo propone): los valores actuales y «Guardar cambio».
 *
 * Al proponer, la tarjeta entra en el chat (`yf:ms-card-sent`); al cambiar, se repinta la del plan
 * (`yf:ms-plan`).
 */
import { esc, icon } from '../../../lib/social/ui';
import { planLong, planShort } from '../../../lib/social/chatView';
import type { ChatMessage, PlanView } from '../../../lib/social/types';
import { intoMiniLayer } from './miniLayer';

export interface PlanPickOpen {
    conv: number;
    title: { type: 'movie' | 'tv'; id: number; title: string; image: string | null };
    source: PlanView['source'];
    wtw?: { of: number; have: number } | null;
    /** Modo «cambiar»: el plan tal como está. */
    edit?: PlanView | null;
    /** Abrir con el foco en la nota («Editar nota»). */
    focusNote?: boolean;
    anchor: HTMLElement | null;
}

const NOTE_MAX = 80;
const HOURS = ['18:00', '19:30', '21:00', '21:30', '22:00'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const shell = document.getElementById('pk');
const backdrop = document.getElementById('pk-bd');
/** Abierto desde el mini-chat (M6): va como capa dentro de la ventanita; esto lo devuelve a su sitio. */
let unlayer: (() => void) | null = null;
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

// ---- Fechas en Madrid ----------------------------------------------------------------------------
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHour = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
const todayIso = () => fmtDay.format(new Date());
const nowHm = () => fmtHour.format(new Date());
const parts = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const add = (day: string, n: number) => { const p = parts(day); return iso(p.y, p.m, p.d + n); };
const weekday = (day: string) => { const p = parts(day); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); };
/** El próximo día de la semana `wd` (0 = domingo) desde hoy, incluido hoy. */
const next = (today: string, wd: number) => add(today, (wd - weekday(today) + 7) % 7);

interface State {
    o: PlanPickOpen;
    sheet: boolean;
    today: string;
    date: string;
    time: string | null;
    note: string;
    /** «Otra fecha» abierta (mes en línea en escritorio). */
    cal: string | null;
    otherTime: boolean;
    sending: boolean;
    error: string | null;
}
let st: State | null = null;

/** Atajos de día: Hoy, Mañana y el próximo sábado y domingo si no coinciden. */
function shortcuts(today: string): { iso: string; b: string; s: string }[] {
    const out = [{ iso: today, b: 'Hoy', s: planShort(today).replace(/ \S+$/, '') }, { iso: add(today, 1), b: 'Mañana', s: planShort(add(today, 1)).replace(/ \S+$/, '') }];
    for (const [wd, b] of [[6, 'Sábado'], [0, 'Domingo']] as const) {
        const d = next(today, wd);
        if (!out.some((x) => x.iso === d)) out.push({ iso: d, b, s: planShort(d).split(' ').slice(1).join(' ') });
    }
    return out;
}

const hourPast = (s: State, h: string) => s.date === s.today && h <= nowHm();

// ---- Pintar ----------------------------------------------------------------------------------
function headHtml(s: State): string {
    const t = s.o.title;
    const poster = t.image ? `<img src="https://image.tmdb.org/t/p/w92${esc(t.image)}" alt="" decoding="async">` : icon(t.type === 'movie' ? 'film' : 'tv');
    return (s.sheet ? '<div class="rk-hd" aria-hidden="true"></div>' : '')
        + `<div class="rk-h"><span class="rc-lead" style="width:34px;height:51px" aria-hidden="true">${poster}</span>`
        + `<div class="rk-h-b"><div class="rk-k">${s.o.edit ? 'Cambiar el plan' : 'Plan para verla'}</div><b>${esc(t.title)}</b></div>`
        + `<button type="button" class="rk-x" data-pk-close aria-label="Cerrar">${icon('x')}</button></div>`;
}

function chip(on: boolean, attrs: string, inner: string, aria?: string, dis = false): string {
    return `<button type="button" class="chp${on ? ' on' : ''}${dis ? ' off' : ''}" role="radio" aria-checked="${on}"${dis ? ' aria-disabled="true" tabindex="-1"' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''} ${attrs}>${inner}</button>`;
}

function monthHtml(s: State): string {
    const p = parts(s.cal!);
    const first = new Date(Date.UTC(p.y, p.m - 1, 1)).getUTCDay(); // 0 = domingo
    const lead = (first + 6) % 7; // semanas de lunes a domingo
    const days = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    const t = parts(s.today);
    const canBack = p.y > t.y || (p.y === t.y && p.m > t.m);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
    for (let d = 1; d <= days; d++) {
        const day = iso(p.y, p.m, d);
        const past = day < s.today;
        const on = day === s.date;
        cells += `<button type="button" role="gridcell" class="${past ? 'past' : ''}${day === s.today ? ' tod' : ''}${on ? ' on' : ''}"`
            + `${past ? ' aria-disabled="true" tabindex="-1"' : ` tabindex="${on ? 0 : -1}"`} aria-selected="${on}" aria-label="${esc(planLong(day, s.today))}" data-pk-cal="${day}">${d}</button>`;
    }
    return `<div class="mcal" role="grid" aria-label="${MONTHS[p.m - 1]} de ${p.y}"><div class="mcal-h">${MONTHS[p.m - 1][0].toUpperCase()}${MONTHS[p.m - 1].slice(1)} ${p.y}<span>`
        + `<button type="button" class="pf-btn ico ghost" aria-label="Mes anterior" data-pk-month="-1"${canBack ? '' : ' disabled'}>${icon('chevron-left')}</button>`
        + `<button type="button" class="pf-btn ico ghost" aria-label="Mes siguiente" data-pk-month="1">${icon('chevron-right')}</button></span></div>`
        + `<div class="mcal-g">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => `<i aria-hidden="true">${w}</i>`).join('')}${cells}</div></div>`;
}

function bodyHtml(s: State): string {
    const sc = shortcuts(s.today);
    const isShort = sc.some((x) => x.iso === s.date);
    const other = !isShort || s.cal !== null;
    const days = sc.map((x) => chip(x.iso === s.date && s.cal === null, `data-pk-day="${x.iso}"`, `<b>${x.b}</b><small>${esc(x.s)}</small>`, planLong(x.iso, s.today))).join('')
        + chip(other, 'data-pk-other', other && !isShort ? `<b>${esc(planShort(s.date).split(' ').slice(0, 2).join(' '))}</b><small>otra fecha</small>` : `${icon('calendar')}<b>Otra fecha</b>`, 'Otra fecha');
    // Móvil: el selector nativo; escritorio: el mes en línea.
    const otherUi = s.cal === null ? '' : s.sheet
        ? `<label class="pl-in pk-native">${icon('calendar')}<span class="sr-only">Otra fecha</span><input type="date" min="${s.today}" value="${s.date}" data-pk-date></label>`
        : monthHtml(s);
    const hours = chip(s.time === null && !s.otherTime, 'data-pk-time=""', 'Sin hora')
        + HOURS.map((h) => chip(s.time === h && !s.otherTime, `data-pk-time="${h}"`, h, undefined, hourPast(s, h))).join('')
        + chip(s.otherTime || (s.time !== null && !HOURS.includes(s.time)), 'data-pk-othertime', `${icon('clock')}${s.time && !HOURS.includes(s.time) ? esc(s.time) : 'Otra'}`, 'Otra hora');
    const otherTime = s.otherTime
        ? `<label class="pl-in pk-native">${icon('clock')}<span class="sr-only">Otra hora</span><input type="time" step="900" value="${s.time ?? ''}" data-pk-timein></label>`
        : '';
    const note = `<label class="pl-in">${icon('sticky-note')}<span class="sr-only">Nota, opcional</span>`
        + `<input type="text" maxlength="${NOTE_MAX}" placeholder="Añade una nota: «en casa de Ana»" value="${esc(s.note)}" data-pk-note autocomplete="off">`
        + `<b data-pk-count>${s.note.length}/${NOTE_MAX}</b></label><span class="sr-only" aria-live="polite" data-pk-count-live></span>`;
    return `<div class="rk-s pk-b">`
        + `<span class="chp-l" id="pk-day-l">Día</span><div class="chps dd2" role="radiogroup" aria-labelledby="pk-day-l">${days}</div>${otherUi}`
        + `<span class="chp-l" id="pk-hour-l">Hora <span class="opt">· opcional</span></span><div class="chps" role="radiogroup" aria-labelledby="pk-hour-l">${hours}</div>${otherTime}`
        + `<span class="chp-l">Nota <span class="opt">· opcional</span></span>${note}</div>`;
}

function footHtml(s: State): string {
    const label = `${planLong(s.date, s.today)}${s.date === s.today || s.date === add(s.today, 1) ? `, ${planShort(s.date).split(' ').slice(0, 2).join(' ')}` : ''} · ${s.time ?? 'sin hora'}`;
    const sum = s.o.edit
        ? `<div class="sp-sum">${icon('calendar-check')}<span><b>${esc(label)}.</b> Se avisará a quien dijo «Voy». Sus respuestas se mantienen.</span></div>`
        : `<div class="sp-sum">${icon('calendar-check')}<span><b>${esc(label)}.</b> Quien diga «Voy» la tendrá en Ver pronto con esta fecha.</span></div>`;
    const err = s.error ? `<div class="rk-err" role="alert">${icon('circle-alert')}<span>${esc(s.error)}</span></div>` : '';
    return `${err}${sum}<button type="button" class="pf-btn pri" data-pk-send${s.sending ? ' disabled' : ''}>${icon('calendar-check')}${s.o.edit ? 'Guardar cambio' : 'Proponer plan'}</button>`;
}

function render(s: State, focus?: string) {
    if (!shell) return;
    const active = (document.activeElement as HTMLElement | null);
    const keep = focus ?? (active && shell.contains(active) ? selectorOf(active) : null);
    shell.innerHTML = headHtml(s) + bodyHtml(s) + `<div class="rk-f" data-pk-foot>${footHtml(s)}</div>`;
    if (keep) shell.querySelector<HTMLElement>(keep)?.focus();
}
/** Para recuperar el foco tras repintar. */
function selectorOf(el: HTMLElement): string | null {
    for (const a of ['data-pk-day', 'data-pk-time', 'data-pk-cal', 'data-pk-month']) {
        const v = el.getAttribute(a);
        if (v !== null) return `[${a}="${CSS.escape(v)}"]`;
    }
    for (const a of ['data-pk-other', 'data-pk-othertime', 'data-pk-note', 'data-pk-date', 'data-pk-timein']) if (el.hasAttribute(a)) return `[${a}]`;
    return null;
}

// ---- Abrir, colocar y cerrar ------------------------------------------------------------------
function place() {
    if (!shell || !st || unlayer) return;
    if (st.sheet || !st.o.anchor) { shell.style.left = ''; shell.style.top = ''; shell.style.bottom = ''; shell.style.maxHeight = ''; return; }
    const r = st.o.anchor.getBoundingClientRect();
    const w = shell.offsetWidth;
    // Encima del compositor, anclado por abajo: al abrir el mes crece hacia arriba y el botón no se sale.
    shell.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
    shell.style.top = 'auto';
    shell.style.bottom = `${window.innerHeight - r.top + 10}px`;
    shell.style.maxHeight = `${Math.min(640, r.top - 18)}px`;
}

export function openPlanPick(o: PlanPickOpen) {
    if (!shell) return;
    if (st) close(false);
    const today = todayIso();
    const e = o.edit;
    // Por defecto: hoy a las 21:30 si aún es pronto (antes de las 18:00); si no, mañana.
    const date = e ? e.date : nowHm() < '18:00' ? today : add(today, 1);
    st = {
        o, sheet: !isDesktop(), today, date, time: e ? e.time : '21:30', note: e?.note ?? '',
        cal: null, otherTime: Boolean(e?.time && !HOURS.includes(e.time)), sending: false, error: null,
    };
    if (e && !shortcuts(today).some((x) => x.iso === e.date)) st.cal = e.date.slice(0, 8) + '01';
    shell.classList.toggle('is-sheet', st.sheet);
    shell.setAttribute('aria-label', `${e ? 'Cambiar el plan de' : 'Plan para ver'} ${o.title.title}`);
    shell.hidden = false;
    unlayer = intoMiniLayer(shell, o.anchor, () => close());
    if (backdrop && !unlayer) backdrop.hidden = false;
    if (st.sheet) document.body.style.overflow = 'hidden';
    render(st, o.focusNote ? '[data-pk-note]' : '.chps.dd2 .chp.on');
    place();
}

function close(restoreFocus = true) {
    if (!st || !shell) return;
    const s = st;
    st = null;
    shell.hidden = true;
    shell.innerHTML = '';
    shell.style.left = shell.style.top = shell.style.bottom = shell.style.maxHeight = '';
    unlayer?.();
    unlayer = null;
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    if (restoreFocus && s.o.anchor?.isConnected) s.o.anchor.focus();
}

// ---- Enviar ------------------------------------------------------------------------------------
const ERR: Record<string, string> = {
    past_date: 'Ese día u hora ya ha pasado. Elige otro.',
    read_only: 'Ya no puedes escribir en esta conversación.',
    note: 'La nota es demasiado larga.',
    rate: 'Vas muy rápido. Espera un momento.',
    not_owner: 'Solo quien lo propone puede cambiarlo.',
    closed: 'Este plan ya no se puede cambiar.',
    same: 'No has cambiado nada.',
};

async function send() {
    const s = st;
    if (!s || s.sending) return;
    if (s.date < s.today || hourPast(s, s.time ?? '99:99')) { s.error = ERR.past_date; render(s); return; }
    s.sending = true; s.error = null;
    const foot = shell?.querySelector('[data-pk-foot]');
    if (foot) foot.innerHTML = footHtml(s);
    const note = s.note.replace(/\s+/g, ' ').trim();
    let res: Response | null = null;
    let d: any = null;
    try {
        if (s.o.edit) {
            const e = s.o.edit;
            const body: Record<string, unknown> = {};
            if (s.date !== e.date) body.date = s.date;
            if (s.time !== e.time) body.time = s.time;
            if ((note || null) !== (e.note || null)) body.note = note || null;
            res = await fetch(`/api/social/messages/plans/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        } else {
            res = await fetch(`/api/social/messages/${s.o.conv}/plans`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaType: s.o.title.type, tmdbId: s.o.title.id, date: s.date, time: s.time, note, source: s.o.source, wtw: s.o.wtw ?? undefined }),
            });
        }
        d = await res.json();
    } catch { /* sin red */ }
    if (st !== s) return;
    s.sending = false;
    if (!res?.ok || !d?.ok) {
        s.error = d?.error === 'exists'
            ? `Ya hay un plan de este título aquí: ${planLong(d.date, s.today).toLowerCase()}${d.time ? ` · ${d.time}` : ''}.`
            : ERR[d?.error] ?? 'No se ha podido guardar. Inténtalo otra vez.';
        if (foot) foot.innerHTML = footHtml(s);
        return;
    }
    close(false);
    if (s.o.edit) document.dispatchEvent(new CustomEvent<PlanView>('yf:ms-plan', { detail: d.plan }));
    else document.dispatchEvent(new CustomEvent<{ conv: number; message: ChatMessage }>('yf:ms-card-sent', { detail: { conv: s.o.conv, message: d.message } }));
}

// ---- Eventos -----------------------------------------------------------------------------------
shell?.addEventListener('click', (e) => {
    const s = st;
    if (!s) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-pk-close]')) { close(); return; }
    const day = t.closest<HTMLElement>('[data-pk-day]');
    if (day) { s.date = day.dataset.pkDay!; s.cal = null; fixTime(s); render(s); return; }
    if (t.closest('[data-pk-other]')) { s.cal = s.date.slice(0, 8) + '01'; render(s, s.sheet ? '[data-pk-date]' : '.mcal [tabindex="0"]'); place(); return; }
    const m = t.closest<HTMLButtonElement>('[data-pk-month]');
    if (m && !m.disabled && s.cal) {
        const p = parts(s.cal);
        s.cal = iso(p.y, p.m + Number(m.dataset.pkMonth), 1);
        render(s, `[data-pk-month="${m.dataset.pkMonth}"]`);
        return;
    }
    const c = t.closest<HTMLElement>('[data-pk-cal]');
    if (c && c.getAttribute('aria-disabled') !== 'true') { s.date = c.dataset.pkCal!; fixTime(s); render(s, `[data-pk-cal="${s.date}"]`); return; }
    const h = t.closest<HTMLElement>('[data-pk-time]');
    if (h && h.getAttribute('aria-disabled') !== 'true') { s.time = h.dataset.pkTime || null; s.otherTime = false; render(s); return; }
    if (t.closest('[data-pk-othertime]')) { s.otherTime = true; render(s, '[data-pk-timein]'); return; }
    if (t.closest('[data-pk-send]')) void send();
});

/** Hoy con una hora ya pasada: se queda sin hora. */
function fixTime(s: State) { if (s.time && hourPast(s, s.time)) s.time = null; }

shell?.addEventListener('input', (e) => {
    const s = st;
    if (!s) return;
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-pk-note]')) {
        s.note = t.value;
        const n = t.value.length;
        const cnt = shell.querySelector('[data-pk-count]');
        if (cnt) cnt.textContent = `${n}/${NOTE_MAX}`;
        // Se anuncia al cruzar 70, 75 y 80.
        const live = shell.querySelector('[data-pk-count-live]');
        if (live && (n === 70 || n === 75 || n === 80)) live.textContent = `${n} de ${NOTE_MAX} caracteres`;
        return;
    }
    if (t.matches('[data-pk-date]') && t.value) {
        s.date = t.value < s.today ? s.today : t.value;
        fixTime(s);
        const foot = shell.querySelector('[data-pk-foot]');
        if (foot) foot.innerHTML = footHtml(s);
        return;
    }
    if (t.matches('[data-pk-timein]') && t.value) {
        s.time = t.value.slice(0, 5);
        const foot = shell.querySelector('[data-pk-foot]');
        if (foot) foot.innerHTML = footHtml(s);
    }
});

document.addEventListener('keydown', (e) => {
    const s = st;
    if (!s || !shell) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    const t = e.target as HTMLElement;
    if (!shell.contains(t)) return;
    // Mes: flechas (días y semanas), Re Pág / Av Pág (meses), Enter elige.
    if (t.matches('[data-pk-cal]')) {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (step || e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            const cur = t.dataset.pkCal!;
            let d = step ? add(cur, step) : (() => { const p = parts(cur); return iso(p.y, p.m + (e.key === 'PageUp' ? -1 : 1), Math.min(p.d, 28)); })();
            if (d < s.today) d = s.today;
            if (d.slice(0, 7) !== s.cal!.slice(0, 7)) { s.cal = d.slice(0, 8) + '01'; render(s); }
            shell.querySelectorAll<HTMLElement>('[data-pk-cal]').forEach((b) => b.setAttribute('tabindex', b.dataset.pkCal === d ? '0' : '-1'));
            shell.querySelector<HTMLElement>(`[data-pk-cal="${d}"]`)?.focus();
            return;
        }
    }
    // Píldoras: ← → dentro de su fila.
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && t.matches('.chp')) {
        const row = [...(t.parentElement?.querySelectorAll<HTMLElement>('.chp:not(.off)') ?? [])];
        const i = row.indexOf(t);
        e.preventDefault();
        row[e.key === 'ArrowRight' ? Math.min(i + 1, row.length - 1) : Math.max(i - 1, 0)]?.focus();
        return;
    }
    if (e.key === 'Enter' && t.matches('[data-pk-note]')) { e.preventDefault(); void send(); return; }
    // Foco atrapado dentro del selector.
    if (e.key === 'Tab') {
        const els = [...shell.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input')].filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    }
}, true);

backdrop?.addEventListener('click', () => close());

// Móvil con el teclado abierto (nota u hora): la hoja queda justo encima, con el botón a la vista.
window.visualViewport?.addEventListener('resize', () => {
    if (!st?.sheet || !shell) return;
    const vv = window.visualViewport!;
    const kb = window.innerHeight - vv.height - vv.offsetTop;
    shell.style.bottom = kb > 120 ? `${kb}px` : '';
    shell.classList.toggle('is-typing', kb > 120);
});
window.addEventListener('resize', () => { if (st && !st.sheet) place(); });
