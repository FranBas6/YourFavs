/**
 * Marcado de los mensajes (M1/M2; handoff docs/Mensajes/design_handoff_mensajes §4): filas de la
 * lista, avatar de grupo, la conversación (grupos de mensajes al estilo Discord, separadores, «Visto»,
 * mensajes de sistema y plegados), la cabecera y el panel de información.
 *
 * Puro (sin DOM ni servidor), como `ui.ts` y `amigosView.ts`: el servidor pinta la lista y el
 * navegador repinta la lista y la conversación con estas mismas funciones. Las horas van en hora de
 * Madrid (`APP_TZ`) en los dos lados, para que lo pintado en el servidor no cambie al repintar.
 * Todo lo que escribe el usuario pasa por `esc()`.
 */
import { avatarHtml, esc, firstName, icon } from './ui';
import { DELETED_ACCOUNT, DELETED_TEXT, FOLDED_TEXT, sysParts, type TextPart } from './messagesText';
import { APP_TZ, appDateParts } from '../../utils/appTime';
import type { ChatMessage, ChatView, ConvSummary, PersonCard, SysType } from './types';

export const MSG_MAX = 2000;
/** Mismo autor con 5 min o menos entre mensajes → mismo grupo (handoff §4.4). */
const GROUP_GAP_MS = 5 * 60 * 1000;

// -------------------------------------------------------------------------------------
// Horas y días
// -------------------------------------------------------------------------------------
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WD_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const fmtHM = new Intl.DateTimeFormat('es-ES', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** «21:04» */
export const hm = (ms: number) => fmtHM.format(new Date(ms));

function dayDiff(ms: number, now: number) {
    const a = appDateParts(ms);
    return { p: a, diff: appDateParts(now).dayNum - a.dayNum, sameYear: a.year === appDateParts(now).year };
}
const dayMonth = (p: { day: number; month: number; year: number }, withYear: boolean) =>
    `${p.day} ${MON[p.month]}${withYear ? ` ${p.year}` : ''}`;

/** Hora de una fila de la lista: «21:04» hoy, «ayer», «lun» esta semana, «12 sep» después. */
export function convTime(ms: number, now = Date.now()): string {
    const { p, diff, sameYear } = dayDiff(ms, now);
    if (diff <= 0) return hm(ms);
    if (diff === 1) return 'ayer';
    if (diff < 7) return WD_SHORT[p.weekday];
    return dayMonth(p, !sameYear);
}

/** Separador de día: «Hoy», «Ayer», «Lunes», «12 sep». */
export function dayLabel(ms: number, now = Date.now()): string {
    const { p, diff, sameYear } = dayDiff(ms, now);
    if (diff <= 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return WD_LONG[p.weekday];
    return dayMonth(p, !sameYear);
}

/** «1.946» (con punto también en 4 cifras, que `es-ES` no agrupa). */
export const num = (n: number) => (n >= 1000 ? `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}` : String(n));

// -------------------------------------------------------------------------------------
// Avatares y contadores
// -------------------------------------------------------------------------------------
/** Persona para quien borró su cuenta (autor null). */
export const GONE: PersonCard = {
    id: '', handle: null, name: DELETED_ACCOUNT, avatar: null, archetype: null, color: 'slate', initials: '?',
};

/** Avatar de grupo: dos caras en diagonal (handoff §4.2). Con una sola, su avatar. */
export function gavHtml(faces: PersonCard[], size = 40): string {
    if (faces.length < 2) {
        return faces[0]
            ? avatarHtml(faces[0], size)
            : `<span class="so-av ms-gav-empty" style="--sb:var(--stamp-blue);--si:var(--stamp-blue-ink);width:${size}px;height:${size}px" aria-hidden="true">${icon('users')}</span>`;
    }
    const k = Math.round(size * 0.7);
    return `<span class="gav" style="width:${size}px;height:${size}px" aria-hidden="true">${avatarHtml(faces[0], k)}${avatarHtml(faces[1], k)}</span>`;
}

/** Contador de mensajes `.mcnt` (globo + número). Vacío si no hay. */
export function mcntHtml(n: number, js = false): string {
    const label = n === 1 ? '1 mensaje sin leer' : `${n} mensajes sin leer`;
    return `<span class="mcnt${js ? ' js-msg-badge' : ''}"${n > 0 ? '' : ' hidden'} aria-label="${label}">${icon('message-circle')}<span class="js-msg-n">${n > 99 ? '99+' : n}</span></span>`;
}

// -------------------------------------------------------------------------------------
// Lista de conversaciones (handoff §4.1)
// -------------------------------------------------------------------------------------
export const chatHref = (id: number) => `/mislistas/amigos/mensajes/${id}`;

export function convRowHtml(c: ConvSummary, o: { active?: number | null; now?: number } = {}): string {
    const on = o.active === c.id;
    const n = on ? 0 : c.unread;
    const group = c.kind === 'group';
    const when = convTime(c.lastAt, o.now);
    const lead = group ? gavHtml(c.faces, 40) : avatarHtml(c.faces[0] ?? GONE, 40);
    const right = c.muted
        ? `<span class="cv-mute" title="Silenciada">${icon('bell-off')}</span>`
        : n > 0 ? `<span class="cv-n">${n > 99 ? '99+' : n}</span>` : '';
    const ro = c.readOnly ? `<span class="cv-ro">${icon('lock')}Solo lectura</span>` : '';
    const label = [
        group ? `Grupo ${c.title}, ${c.count} personas` : c.title,
        n > 0 ? `${n} sin leer` : '',
        c.muted ? 'silenciada' : '',
        c.readOnly ? 'solo lectura' : '',
        `último mensaje ${when}`,
    ].filter(Boolean).join(', ');
    return `<li><a class="cv${on ? ' on' : ''}${n > 0 ? ' un' : ''}" href="${chatHref(c.id)}" data-conv="${c.id}" aria-label="${esc(label)}"${on ? ' aria-current="page"' : ''}>`
        + lead
        + `<span class="cv-b"><span class="cv-t"><b>${esc(c.title)}</b><time>${esc(when)}</time></span>`
        + `<span class="cv-p">${ro}<span class="tx">${esc(c.preview)}</span>${right}</span></span></a></li>`;
}

export function railListHtml(convs: ConvSummary[], o: { active?: number | null; now?: number; emptyText?: string } = {}): string {
    if (!convs.length) return `<li class="ms-none">${esc(o.emptyText ?? 'Nada todavía')}</li>`;
    return convs.map((c) => convRowHtml(c, o)).join('');
}

/** Total del contador: las no silenciadas (la abierta cuenta 0). */
export const unreadOf = (convs: ConvSummary[], active?: number | null) =>
    convs.reduce((s, c) => s + (c.muted || c.id === active ? 0 : c.unread), 0);

// -------------------------------------------------------------------------------------
// Texto de un mensaje: enlaces sin vista previa (handoff §4.4)
// -------------------------------------------------------------------------------------
const URL_RE = /\bhttps?:\/\/[^\s<>"]+|\b(?:[a-z0-9-]+\.)+(?:com|es|net|org|io|app|dev|tv|me|co|eu|info|fm|ly|gl|be)\b(?:\/[^\s<>"]*)?/gi;

export function linkify(text: string): string {
    let out = '';
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
        let url = m[0];
        // Puntuación pegada al final («mira esto: x.com/a.»): fuera del enlace.
        const trail = url.match(/[.,;:!?)\]»"']+$/);
        if (trail) url = url.slice(0, -trail[0].length);
        const start = m.index ?? 0;
        // Un «correo@dominio.com» no es un enlace.
        if (start > 0 && text[start - 1] === '@') continue;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        out += esc(text.slice(last, start))
            + `<a href="${esc(href)}" target="_blank" rel="noopener nofollow ugc">${esc(url)}</a>`;
        last = start + url.length;
    }
    return out + esc(text.slice(last));
}

// -------------------------------------------------------------------------------------
// La conversación (handoff §4.4)
// -------------------------------------------------------------------------------------
/** Un mensaje tuyo que aún no ha llegado al servidor (o que falló). */
export interface PendingMsg { clientId: string; body: string; at: number; failed: boolean }

export interface LogCtx {
    me: string;
    group: boolean;
    people: Record<string, PersonCard>;
    /** `last_read_id` AL ABRIR: el separador «Nuevos» va encima del primero ajeno posterior. */
    newAfter: number | null;
    seenId: number | null;
    seenAt: number | null;
    pending: PendingMsg[];
    /** Texto de los plegados que has pedido ver («Mostrar»), solo en esta sesión. */
    revealed: Record<number, string>;
    now?: number;
    /** Móvil: avatares de 32. */
    compact?: boolean;
}

/**
 * Dónde va «Nuevos» al abrir: tras `lastReadId` si hay algún mensaje de otra persona sin leer;
 * si no, en ningún sitio (y así se queda hasta salir, aunque lleguen más).
 */
export function newAnchor(msgs: ChatMessage[], me: string, lastReadId: number | null): number | null {
    const last = lastReadId ?? 0;
    return msgs.some((m) => m.id > last && m.author !== me && m.kind === 'text') ? last : null;
}

const SYS_ICON: Record<SysType, string> = {
    created: 'users', added: 'user-plus', left: 'log-out', removed: 'user-minus', renamed: 'pencil', admin: 'shield',
};

const partsHtml = (parts: TextPart[]) => parts.map((p) => (p.b ? `<b>${esc(p.t)}</b>` : esc(p.t))).join('');

function actionsHtml(): string {
    return `<span class="mm-act" role="toolbar" aria-label="Acciones del mensaje">`
        + `<button type="button" data-mact="copy" aria-label="Copiar texto" title="Copiar texto">${icon('copy')}</button>`
        + `<button type="button" data-mact="menu" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones" title="Más acciones">${icon('ellipsis')}</button>`
        + `</span>`;
}

function lineHtml(m: ChatMessage, body: string | null, own: boolean): string {
    const t = `<span class="gt" aria-hidden="true">${hm(m.at)}</span>`;
    if (m.deleted) return `<div class="mm del" data-mid="${m.id}">${t}${icon('trash-2')}${DELETED_TEXT}</div>`;
    return `<div class="mm" tabindex="-1" data-mid="${m.id}"${own ? ' data-own' : ''}>${t}<span class="mm-t">${linkify(body ?? '')}</span>${actionsHtml()}</div>`;
}

function pendingLineHtml(p: PendingMsg): string {
    const st = p.failed
        ? `<span class="mm-st err" role="alert">${icon('circle-alert')}<span>No se ha enviado.</span>`
            + `<button type="button" class="pf-btn sm" data-retry="${esc(p.clientId)}">${icon('refresh-cw')}Reintentar</button>`
            + `<button type="button" class="pf-btn sm ghost" data-discard="${esc(p.clientId)}">Borrar</button></span>`
        : `<span class="mm-st">${icon('clock')}Enviando…</span>`;
    return `<div class="mm${p.failed ? '' : ' sending'}" data-cid="${esc(p.clientId)}"><span class="mm-t">${linkify(p.body)}</span>${st}</div>`;
}

interface Item { m: ChatMessage | null; p: PendingMsg | null; at: number; author: string | null }
/** Grupo abierto: mismo autor, hora de su último mensaje y su marcado. */
interface Group { author: string | null; at: number; head: string; lines: string }
const flush = (g: Group | null) => (g ? `${g.head}${g.lines}</div></div>` : '');

/** La conversación entera, de arriba abajo. */
export function logHtml(msgs: ChatMessage[], ctx: LogCtx): string {
    const now = ctx.now ?? Date.now();
    const avSize = ctx.compact ? 32 : 40;
    const person = (id: string | null) => (id && ctx.people[id]) || GONE;
    const nameOf = (id: string | null) => person(id).name;

    // «Visto» (1:1): bajo tu último mensaje con id ≤ lo que ha leído la otra persona.
    let seenTarget = -1;
    if (!ctx.group && ctx.seenId) {
        for (const m of msgs) if (m.author === ctx.me && m.kind === 'text' && m.id <= ctx.seenId) seenTarget = m.id;
    }
    const seenHtml = `<div class="ms-seen">${icon('eye')}Visto${ctx.seenAt ? ` · ${hm(ctx.seenAt)}` : ''}</div>`;

    const items: Item[] = [
        ...msgs.map((m) => ({ m, p: null, at: m.at, author: m.author })),
        ...ctx.pending.map((p) => ({ m: null, p, at: p.at, author: ctx.me })),
    ];

    let html = '';
    let lastDay = '';
    let newDone = ctx.newAfter === null;
    let cur: Group | null = null;

    for (const it of items) {
        const day = appDateParts(it.at).key;
        if (day !== lastDay) {
            html += flush(cur); cur = null;
            html += `<div class="ms-day" role="separator">${esc(dayLabel(it.at, now))}</div>`;
            lastDay = day;
        }
        const m = it.m;
        if (!newDone && m && m.id > (ctx.newAfter ?? 0) && m.author !== ctx.me && m.kind === 'text') {
            html += flush(cur); cur = null;
            html += `<div class="ms-new" role="separator" aria-label="Mensajes nuevos"><span>Nuevos</span></div>`;
            newDone = true;
        }
        // Los de sistema y los plegados cortan el grupo.
        if (m && m.kind === 'system' && m.sys) {
            html += flush(cur); cur = null;
            html += `<div class="ms-sys" role="note">${icon(SYS_ICON[m.sys.type] ?? 'info')}<p>${partsHtml(sysParts(m.sys, ctx.me, nameOf))}<time>${hm(m.at)}</time></p></div>`;
            continue;
        }
        if (m && m.folded && !(m.id in ctx.revealed)) {
            html += flush(cur); cur = null;
            html += `<div class="ms-fold" data-mid="${m.id}">${icon('eye-off')}<p>${FOLDED_TEXT} · ${hm(m.at)}</p><button type="button" class="lk" data-reveal="${m.id}">Mostrar</button></div>`;
            continue;
        }
        const own = it.author === ctx.me;
        const line = m ? lineHtml(m, m.folded ? ctx.revealed[m.id] : m.body, own) : pendingLineHtml(it.p!);
        if (cur && cur.author !== null && cur.author === it.author && it.at - cur.at <= GROUP_GAP_MS) {
            cur.lines += line;
            cur.at = it.at;
        } else {
            html += flush(cur);
            const who = person(it.author);
            cur = {
                author: it.author,
                at: it.at,
                head: `<div class="mg" role="article" aria-label="${esc(`${own ? 'Tú' : who.name}, ${hm(it.at)}`)}">`
                    + avatarHtml(who, avSize)
                    + `<div class="mg-b"><div class="mg-h"><b>${esc(who.name)}</b>${own ? '<span class="me">tú</span>' : ''}<time>${hm(it.at)}</time></div>`,
                lines: line,
            };
        }
        if (m && m.id === seenTarget) cur.lines += seenHtml;
    }
    return html + flush(cur);
}

// -------------------------------------------------------------------------------------
// Cabecera y panel de información (handoff §4.3 y §4.8)
// -------------------------------------------------------------------------------------
/** «Amigos desde mayo» (este año) o «Amigos desde diciembre de 2025». */
export function friendsSinceLabel(iso: string | null, now = Date.now()): string {
    if (!iso) return '';
    const p = appDateParts(new Date(iso).getTime());
    const month = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][p.month];
    return p.year === appDateParts(now).year ? `Amigos desde ${month}` : `Amigos desde ${month} de ${p.year}`;
}

export const otherOf = (chat: ChatView) => chat.members.find((m) => m.person.id !== chat.me.id)?.person ?? GONE;

/** «Ana, Lucía, Carla, Pepe y tú». */
function membersLine(chat: ChatView): string {
    const names = chat.members.filter((m) => m.person.id !== chat.me.id).map((m) => firstName(m.person.name));
    return names.length ? `${names.join(', ')} y tú` : 'Solo tú';
}

export function chatSubtitle(chat: ChatView): string {
    if (chat.kind === 'group') return `${chat.members.length} personas · ${membersLine(chat)}`;
    const o = otherOf(chat);
    return [o.handle ? `@${o.handle}` : '', friendsSinceLabel(chat.friendsSince)].filter(Boolean).join(' · ');
}

/** Interruptor «Silenciar» (role=switch). */
export function muteSwitchHtml(muted: boolean): string {
    return `<div class="ms-tg">${icon('bell-off')}<span class="t" aria-hidden="true">Silenciar<small>Sin contador. Los mensajes siguen llegando.</small></span>`
        + `<button type="button" class="ms-sw" role="switch" aria-checked="${muted}" aria-label="Silenciar: sin contador, los mensajes siguen llegando" data-ms-mute></button></div>`;
}

/** Panel de información de un 1:1. */
export function infoDirectHtml(chat: ChatView): string {
    const o = otherOf(chat);
    const arch = o.archetype ? `<span class="so-arch">${icon(o.archetype.icon)}${esc(o.archetype.name)}</span>` : '';
    const since = friendsSinceLabel(chat.friendsSince);
    const acts = o.handle && !chat.readOnly
        ? `<div class="ms-id-acts"><a class="pf-btn sm" href="/u/${esc(o.handle)}">${icon('user')}Ver perfil</a>`
            + `<button type="button" class="pf-btn sm" data-recommend data-to="${esc(o.handle)}" aria-haspopup="dialog">${icon('send')}Recomendar algo</button></div>`
        : o.handle ? `<div class="ms-id-acts"><a class="pf-btn sm" href="/u/${esc(o.handle)}">${icon('user')}Ver perfil</a></div>` : '';
    return `<div class="ms-id">${avatarHtml(o, 72)}<b>${esc(o.name)}</b>`
        + (o.handle ? `<span class="h">@${esc(o.handle)}</span>` : '')
        + arch + (since ? `<span class="s">${esc(since)}</span>` : '') + acts + `</div>`
        + `<div class="ms-blk"><h5>Esta conversación</h5>${muteSwitchHtml(chat.me.muted)}</div>`
        + `<p class="ms-priv">${icon('lock')}Solo la veis ${esc(firstName(o.name))} y tú.</p>`;
}

/** Las dos entradas más recientes que no eres tú (avatar de grupo, handoff §4.2). */
export const groupFaces = (chat: ChatView) =>
    chat.members.filter((m) => m.person.id !== chat.me.id).slice(-2).map((m) => m.person);

export const GROUP_MAX = 10;
export const GROUP_NAME_MAX = 40;

/** Nombre del grupo convertido en campo (Renombrar, handoff §4.8): «16/40», Cancelar y Guardar. */
export function renameHtml(name: string): string {
    return `<div class="ms-ren" data-gm-ren><label class="gp-l" for="ms-ren-in">Nombre del grupo</label>`
        + `<span class="rk-in"><input id="ms-ren-in" type="text" maxlength="${GROUP_NAME_MAX}" value="${esc(name)}" autocomplete="off" data-gm-ren-in><b class="gp-c" aria-live="polite" data-gm-ren-n>${name.length}/${GROUP_NAME_MAX}</b></span>`
        + `<div class="ms-ren-r"><span>Enter para guardar</span><div><button type="button" class="pf-btn sm ghost" data-gm="rename-cancel">Cancelar</button>`
        + `<button type="button" class="pf-btn sm pri" data-gm="rename-save">Guardar</button></div></div></div>`;
}

/** Panel de información de un grupo: personas con su papel y, si eres admin, los ajustes. */
export function infoGroupHtml(chat: ChatView): string {
    const admin = chat.me.role === 'admin';
    const admins = chat.members.filter((m) => m.role === 'admin').length;
    const full = chat.members.length >= GROUP_MAX;
    const rows = chat.members.map((m) => {
        const me = m.person.id === chat.me.id;
        const first = firstName(m.person.name);
        const tags = (m.role === 'admin' ? `<span class="ms-role">${icon('shield')}Admin</span>` : '')
            + (me ? '<span class="ms-role n">Tú</span>' : '')
            + (m.blockedByMe ? '<span class="ms-role n">Has bloqueado</span>' : '');
        const who = `data-uid="${esc(m.person.id)}" data-name="${esc(m.person.name)}"`;
        const menu = admin && !me
            ? `<span class="pf-menu-wrap"><button type="button" class="pf-btn ico ms-mb-more" aria-haspopup="menu" aria-expanded="false" data-menu-toggle aria-label="Opciones para ${esc(first)}">${icon('ellipsis')}</button>`
                + `<div class="pf-menu" role="menu" hidden>`
                + (m.person.handle ? `<a role="menuitem" href="/u/${esc(m.person.handle)}">${icon('user')}Ver perfil</a>` : '')
                + (m.role !== 'admin' ? `<button type="button" role="menuitem" data-gm="admin" ${who}>${icon('shield')}Hacer administrador</button>` : '')
                + `<hr><button type="button" role="menuitem" class="pf-danger" data-gm="remove" ${who}>${icon('user-minus')}Quitar del grupo</button>`
                + `</div></span>`
            : '';
        return `<div class="mb">${avatarHtml(m.person, 32)}<div class="tx"><b>${esc(m.person.name)}</b>${m.person.handle ? `<span>@${esc(m.person.handle)}</span>` : ''}</div><span class="tags">${tags}</span>${menu}</div>`;
    }).join('');
    const name = `<div class="gname" data-gm-name><span data-gm-title>${esc(chat.title)}</span>`
        + (admin ? `<button type="button" class="pf-btn ico ghost" data-gm="rename" aria-label="Renombrar" title="Renombrar">${icon('pencil')}</button>` : '')
        + `</div>`;
    const add = admin
        ? `<div class="ms-id-acts"><button type="button" class="pf-btn sm" data-ms-addpeople aria-haspopup="dialog"`
            + ` data-conv="${chat.id}" data-count="${chat.members.length}" data-title="${esc(chat.title)}" data-faces="${esc(JSON.stringify(groupFaces(chat)))}">`
            + `${icon('user-plus')}Añadir personas</button></div>`
        : '';
    return `<div class="ms-id">${gavHtml(groupFaces(chat), 64)}${name}<span class="s">${chat.members.length} de ${GROUP_MAX} personas${full ? ' · completo' : ''}</span>${add}</div>`
        + `<div class="ms-blk"><h5>Personas<span>${admin ? 'Eres admin' : admins === 1 ? '1 admin' : `${admins} admins`}</span></h5><div class="mbl">${rows}</div></div>`
        + `<div class="ms-blk">${muteSwitchHtml(chat.me.muted)}`
        + `<button type="button" class="ms-dgr" data-gm="leave">${icon('log-out')}Salir del grupo</button></div>`;
}

export const infoHtml = (chat: ChatView) => (chat.kind === 'group' ? infoGroupHtml(chat) : infoDirectHtml(chat));

/** Vacíos y errores dentro de la columna central (handoff §5). */
export function emptyHtml(o: { color: string; icon: string; title: string; text: string; actions?: string }): string {
    return `<div class="ms-emp"><span class="ms-emp-st" style="--sb:var(--stamp-${o.color});--si:var(--stamp-${o.color}-ink)">${icon(o.icon)}</span>`
        + `<h2>${esc(o.title)}</h2><p>${esc(o.text)}</p>${o.actions ? `<div class="ms-emp-a">${o.actions}</div>` : ''}</div>`;
}
