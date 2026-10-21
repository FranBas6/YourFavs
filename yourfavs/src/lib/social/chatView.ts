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
import { avatarHtml, btn, esc, firstName, icon, relTime } from './ui';
import { DELETED_ACCOUNT, DELETED_TEXT, FOLDED_TEXT, sysParts, type TextPart } from './messagesText';
import { APP_TZ, appDateParts } from '../../utils/appTime';
import { formatScore } from '../../utils/constants/helpers/media-helpers';
import type { CardPerson, ChatCard, ChatMessage, ChatView, ConvSummary, PersonCard, RecCard, SpoilerRef, SysType, TitleCard, TitleCardRef } from './types';
import { recHref, recLeadHtml } from './recUi';

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
export interface PendingMsg { clientId: string; body: string; at: number; failed: boolean; spoiler?: SpoilerRef | null }

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
    /** 1:1: la otra persona (las recomendaciones que le enviaste la nombran). */
    other?: PersonCard | null;
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

// -------------------------------------------------------------------------------------
// Tarjetas (M4, handoff M4 §3.1–§3.2 y §4): un bloque dentro del grupo de su autor, debajo de la
// línea del comentario. Mismo marco para los tres tipos; los distingue el sello y el texto.
// -------------------------------------------------------------------------------------
const POSTER = (path: string) => `https://image.tmdb.org/t/p/w185${path}`;

/** Ficha del título. */
export const titleHref = (r: Pick<TitleCardRef, 'mediaType' | 'tmdbId'>) => `/${r.mediaType === 'movie' ? 'movie' : 'serie'}/${r.tmdbId}`;

/** «Película · 2023 · 2 h 4 min» / «Serie · 2022 · 2 temporadas». */
export function titleMeta(r: TitleCardRef): string {
    const parts = [r.mediaType === 'movie' ? 'Película' : 'Serie'];
    if (r.year) parts.push(r.year);
    if (r.mediaType === 'movie' && r.runtime) {
        const h = Math.floor(r.runtime / 60), m = r.runtime % 60;
        parts.push(h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`);
    }
    if (r.mediaType === 'tv' && r.seasons) parts.push(r.seasons === 1 ? '1 temporada' : `${r.seasons} temporadas`);
    return parts.join(' · ');
}

const ratingHtml = (score: number) => `<span class="rt">${icon('star', 'str')}${esc(formatScore(score))}</span>`;
const stampMini = (color: string, name: string) =>
    `<span class="tc-st" style="--sb:var(--stamp-${color});--si:var(--stamp-${color}-ink)" aria-hidden="true">${icon(name)}</span>`;

/** Tu píldora: «La tienes pendiente» · «La viste · ★ 8,5» · «Vas por T2 E3». */
function viewerHtml(v: TitleCard['viewer']): { html: string; sr: string } {
    if (!v) return { html: '', sr: 'No la tienes' };
    if (v.state === 'pending') return { html: `<span class="tc-me">${icon('clock')}La tienes pendiente</span>`, sr: 'La tienes pendiente' };
    if (v.state === 'seen') {
        return {
            html: `<span class="tc-me ok">${icon('circle-check')}La viste${v.score != null ? ` · ${ratingHtml(v.score)}` : ''}</span>`,
            sr: `La viste${v.score != null ? `, tu nota ${formatScore(v.score)}` : ''}`,
        };
    }
    const ep = v.season != null && v.episode != null ? `T${v.season} E${v.episode}` : '';
    const text = !ep ? 'La estás viendo' : v.upToDate ? `Al día · ${ep}` : `Vas por ${ep}`;
    return { html: `<span class="tc-me">${icon('play')}${text}</span>`, sr: text };
}

const PERSON_STATE: Record<CardPerson['state'], string> = { seen: 'la vio', watching: 'la está viendo', pending: 'pendiente' };

/** Lo de una persona: su nota (si la vio y puntuó) o el estado. */
function personBit(p: CardPerson, name: string, html: boolean): string {
    if (p.state === 'seen' && p.score != null) return html ? `<b>${esc(name)}</b>${ratingHtml(p.score)}` : `${name}: nota ${formatScore(p.score)}`;
    return html ? `<b>${esc(name)}</b><span>${PERSON_STATE[p.state]}</span>` : `${name}: ${PERSON_STATE[p.state]}`;
}

/** Línea de caras: como mucho 2 y «y N más» (que despliega la lista entera). */
function peopleHtml(list: CardPerson[], people: Record<string, PersonCard>): string {
    const known = list.filter((p) => people[p.id]);
    if (!known.length) return '';
    const bit = (p: CardPerson) => `<span class="f">${avatarHtml(people[p.id], 20)}${personBit(p, firstName(people[p.id].name), true)}</span>`;
    const shown = known.slice(0, 2).map(bit).join('<span class="dot" aria-hidden="true">·</span>');
    const rest = known.length - 2;
    const more = rest > 0
        ? `<details class="tc-more"><summary>y ${rest} más</summary><div class="pf-menu tc-more-l" role="list">`
            + known.map((p) => `<div role="listitem">${avatarHtml(people[p.id], 22)}${personBit(p, people[p.id].name, true)}</div>`).join('')
            + `</div></details>`
        : '';
    return `<div class="tc-fr">${shown}${more}</div>`;
}

/** Ficha de lo que enseña una tarjeta. */
export function cardHref(card: ChatCard): string {
    return card.type === 'title' ? titleHref(card.ref) : recHref(card.ref);
}

/**
 * Una tarjeta, con el estado de quien mira. `o.other`: la otra persona de un 1:1 (las
 * recomendaciones la nombran); `o.at`: cuándo se envió.
 */
export function cardHtml(
    card: ChatCard, people: Record<string, PersonCard>, o: { other?: PersonCard | null; at?: number; now?: number } = {},
): string {
    const now = o.now ?? Date.now();
    return card.type === 'title' ? titleCardHtml(card, people) : recCardHtml(card, o.other ?? null, o.at ?? now, now);
}

/** Tarjeta de título. */
function titleCardHtml(card: TitleCard, people: Record<string, PersonCard>): string {
    const r = card.ref;
    const href = titleHref(r);
    const me = viewerHtml(card.viewer);
    const poster = r.poster
        ? `<img src="${POSTER(esc(r.poster))}" alt="" loading="lazy" decoding="async">`
        : icon(r.mediaType === 'movie' ? 'film' : 'tv');
    const acts = (card.viewer ? '' : btn('Añadir a Pendientes', {
        kind: 'pri', icon: 'bookmark-plus', size: 'sm',
        attrs: `data-tc-add data-mt="${r.mediaType}" data-tmdb="${r.tmdbId}"`,
    })) + `<a class="pf-btn sm ghost" href="${href}">${icon('arrow-up-right')}Ver ficha</a>`;
    const known = card.people.filter((p) => people[p.id]);
    const sr = [`Título: ${r.title}`, me.sr, ...known.map((p) => personBit(p, firstName(people[p.id].name), false))].join('. ');
    return `<div class="tc" role="article" aria-label="${esc(sr)}">`
        + `<div class="tc-k">${stampMini('slate', 'clapperboard')}<span>Título</span></div>`
        + `<a class="tc-po" href="${href}" tabindex="-1" aria-hidden="true">${poster}</a>`
        + `<div class="tc-b"><a class="tc-t" href="${href}">${esc(r.title)}</a><div class="tc-m">${esc(titleMeta(r))}</div>`
        + me.html + peopleHtml(card.people, people)
        + `<div class="tc-a">${acts}</div></div></div>`;
}

// Recomendación de F4 en el 1:1 (M4b; handoff M4 §4 «Zona de recomendación»). Respeta F4 al 100 %:
// quien la envía solo ve «Enviada» o «La añadió…», y nunca hay caras ni más estado de quien la recibe.
const REC_KIND: Record<RecCard['ref']['targetType'], string> = { movie: 'Película', tv: 'Serie', person: 'Persona', company: 'Productora' };
const REC_SR: Record<RecCard['state'], string> = {
    pending: 'pendiente', added: 'añadida a Pendientes', alerts: 'avisos activados', opened: 'abierta',
    discarded: 'descartada', had: 'ya la tenías', seen: 'ya la viste', sent: 'enviada',
};

function recZoneHtml(card: RecCard, first: string): string {
    const z = (cls: string, ico: string, text: string, small = '') =>
        `<div class="tc-z ${cls}">${icon(ico)}<span>${esc(text)}</span>${small ? `<small>${esc(small)}</small>` : ''}</div>`;
    const person = card.ref.targetType === 'person';
    if (card.dir === 'out') {
        if (card.state === 'added') return z('ok', 'check', `${first} la añadió a Pendientes`);
        if (card.state === 'alerts') return z('ok', 'check', `${first} activó los avisos de sus estrenos`);
        return z('nt', 'send', 'Enviada');
    }
    switch (card.state) {
        case 'added': return z('ok', 'check', 'Añadida a Pendientes');
        case 'alerts': return z('ok', 'check', 'Avisos de sus estrenos activados');
        case 'opened': return z('ok', 'check', 'Abierta');
        case 'discarded': return z('nt', 'x', 'Descartada', `${first} no lo sabrá.`);
        case 'had': return z('nt', 'info', person ? 'Ya tenías activados sus avisos' : 'Ya la tenías en tus listas');
        case 'seen': return z('nt', 'eye', 'Ya la viste');
        default: return '';
    }
}

/** Tarjeta de recomendación. `other`: la otra persona del 1:1 (quien la envía o quien la recibe). */
function recCardHtml(card: RecCard, other: PersonCard | null, at: number, now: number): string {
    const r = card.ref;
    const href = recHref(r);
    const first = firstName(other?.name ?? DELETED_ACCOUNT);
    const isTitle = r.targetType === 'movie' || r.targetType === 'tv';
    const lead = isTitle
        ? `<a class="tc-po" href="${esc(href)}" tabindex="-1" aria-hidden="true">${r.image ? `<img src="${POSTER(esc(r.image))}" alt="" loading="lazy" decoding="async">` : icon(r.targetType === 'movie' ? 'film' : 'tv')}</a>`
        : `<a class="tc-lead" href="${esc(href)}" tabindex="-1" aria-hidden="true">${recLeadHtml({ targetType: r.targetType, title: r.title, image: r.image ?? null }, 64)}</a>`;
    const open = card.dir === 'in' && card.state === 'pending';
    const attrs = (a: string) => `data-tc-ra="${a}" data-rec-id="${r.recId}"`;
    const main = r.targetType === 'person'
        ? btn('Activar avisos de sus estrenos', { kind: 'pri', icon: 'bell', size: 'sm', attrs: attrs('alerts') })
        : r.targetType === 'company'
            ? btn('Ver productora', { icon: 'building', size: 'sm', attrs: `${attrs('open')} data-href="${esc(href)}"` })
            : btn('Añadir a Pendientes', { kind: 'pri', icon: 'bookmark-plus', size: 'sm', attrs: attrs('add') });
    const acts = open
        ? main + btn('Descartar', { kind: 'ghost', size: 'sm', attrs: attrs('discard') })
        : `<a class="pf-btn sm ghost" href="${esc(href)}">${icon('arrow-up-right')}${r.targetType === 'company' ? 'Ver productora' : 'Ver ficha'}</a>`;
    const kicker = card.dir === 'in' ? `Recomendación · de ${first}` : `Recomendación · para ${first}`;
    const sr = `Recomendación ${card.dir === 'in' ? 'de' : 'para'} ${first}: ${r.title}, ${REC_SR[card.state]}`;
    return `<div class="tc tc-rec" role="article" aria-label="${esc(sr)}" data-tc-rec="${r.recId}">`
        + `<div class="tc-k">${stampMini('amber', 'send')}<span>${esc(kicker)}</span><em>${esc(relTime(at, now))}</em></div>`
        + lead
        + `<div class="tc-b"><a class="tc-t" href="${esc(href)}">${esc(r.title)}</a><div class="tc-m">${REC_KIND[r.targetType]}</div>`
        + `<div aria-live="polite">${recZoneHtml(card, first)}</div>`
        + `<div class="tc-a">${acts}</div></div></div>`;
}

/**
 * Menú del ＋ (handoff M4 §4): Compartir un título · Recomendar · ¿Qué vemos? · Marcar como spoiler.
 * Las acciones abren su selector con los `data-*` de cada fila (los atiende `SocialLayer`).
 */
export function plusMenuHtml(conv: { id: number; group: boolean; title: string; to?: string | null; friends?: string[] }): string {
    const stamp = (color: string, name: string) =>
        `<span class="tc-st" style="--sb:var(--stamp-${color});--si:var(--stamp-${color}-ink)" aria-hidden="true">${icon(name)}</span>`;
    const item = (attrs: string, color: string, ico: string, title: string, text: string) =>
        `<button type="button" class="pm-i" role="menuitem" ${attrs}>${stamp(color, ico)}<span><b>${esc(title)}</b><small>${esc(text)}</small></span></button>`;
    const share = `data-share-title data-conv="${conv.id}" data-conv-title="${esc(conv.title)}"${conv.group ? ' data-group' : ''} data-anchor="[data-ms-plus]"`;
    let html = item(share, 'slate', 'clapperboard', 'Compartir un título', 'Película o serie, con lo que lleva cada cual');
    // Recomendar (F4, la de siempre): en un 1:1, a esa persona; en un grupo, a tus amigos de dentro.
    // La tarjeta sale en vuestro 1:1, nunca en el grupo.
    if (!conv.group && conv.to) {
        html += item(`data-recommend data-to="${esc(conv.to)}" data-anchor="[data-ms-plus]"`, 'amber', 'send', 'Recomendar',
            `A ${firstName(conv.title)}, como en Amigos`);
    } else if (conv.group && conv.friends?.length) {
        html += item(`data-recommend data-friends="${esc(conv.friends.join(','))}" data-anchor="[data-ms-plus]"`, 'amber', 'send', 'Recomendar',
            'A alguien del grupo, como en Amigos');
    }
    // Marcar como spoiler (M4c): lo que escribas a continuación sale oculto para quien no haya llegado.
    html += item(`data-spoil-pick data-conv="${conv.id}" data-anchor="[data-ms-plus]"`, 'blue', 'shield', 'Marcar como spoiler',
        'De una película o de un episodio');
    return html;
}

// -------------------------------------------------------------------------------------
// Spoilers (M4c; handoff M4 §3.4): el escudo para quien no ha llegado (barras en lugar del texto,
// que no ha llegado al navegador) y la etiqueta para los demás.
// -------------------------------------------------------------------------------------
/** «T2 E5», o nada si es de la serie entera o de una película. */
export const spoilerEp = (sp: SpoilerRef) => (sp.season && sp.episode ? `T${sp.season} E${sp.episode}` : '');
/** «Severance T2 E5» · «Perfect Days». */
export const spoilerLabel = (sp: SpoilerRef) => [sp.title, spoilerEp(sp)].filter(Boolean).join(' ');
const spoilerLong = (sp: SpoilerRef) => `${sp.title}${sp.season && sp.episode ? `, temporada ${sp.season}, episodio ${sp.episode}` : ''}`;

/** Tu estado con el título, al pie del escudo: «Vas por T2 E3» · «La tienes pendiente»… */
function shieldYou(m: ChatMessage): string {
    const v = m.spoilerViewer;
    if (!v) return m.spoiler?.mediaType === 'movie' ? 'No la has visto' : 'No la has empezado';
    if (v.state === 'pending') return 'La tienes pendiente';
    if (v.state === 'seen') return 'Aún no has llegado';
    if (v.season != null && v.episode != null) return `Vas por T${v.season} E${v.episode}`;
    return 'La estás viendo';
}

function shieldHtml(m: ChatMessage): string {
    const sp = m.spoiler!;
    const ep = spoilerEp(sp);
    const bars = (m.lines?.length ? m.lines : [90]).map((w) => `<i style="width:${Math.max(20, Math.min(100, Number(w) || 100))}%"></i>`).join('');
    return `<div class="shd" role="group" aria-label="${esc(`Spoiler de ${spoilerLong(sp)}. Mensaje oculto`)}">`
        + `<div class="shd-h">${icon('shield')}<span>Spoiler de <b>${esc(sp.title)}</b>${ep ? ` · ${ep}` : ''}</span></div>`
        + `<div class="shd-bars" aria-hidden="true">${bars}</div>`
        + `<div class="shd-f"><span>${esc(shieldYou(m))}</span>`
        + btn('Mostrar igualmente', { size: 'sm', icon: 'eye', attrs: `data-spoil-show="${m.id}"` }) + `</div></div>`;
}

/** Etiqueta encima del texto: tuyo («Spoiler»), ya lo has visto, o mostrado en esta sesión (+ «Ocultar»). */
function spoilerTagHtml(m: ChatMessage, own: boolean, shown: boolean): string {
    const sp = m.spoiler!;
    const [cls, ico, text] = own ? ['own', 'shield', 'Spoiler'] : shown ? ['shown', 'eye', 'Mostrado'] : ['seen', 'circle-check', 'Ya lo has visto'];
    return `<div class="sp-r"><span class="sptag ${cls}">${icon(ico)}${text} · ${esc(spoilerLabel(sp))}</span>`
        + (shown && !own ? `<button type="button" class="lk" data-spoil-hide="${m.id}">Ocultar</button>` : '') + `</div>`;
}

function lineHtml(m: ChatMessage, body: string | null, own: boolean, ctx: LogCtx, now: number): string {
    const t = `<span class="gt" aria-hidden="true">${hm(m.at)}</span>`;
    if (m.deleted) return `<div class="mm del" data-mid="${m.id}">${t}${icon('trash-2')}${DELETED_TEXT}</div>`;
    // Spoiler: bloqueado → escudo (la tarjeta, si la hay, se ve igual debajo); si no, la etiqueta encima.
    const shown = m.id in ctx.revealed && m.locked;
    let text = body ? `<span class="mm-t">${linkify(body)}</span>` : '';
    if (m.spoiler && m.locked && !shown) text = shieldHtml(m);
    else if (m.spoiler && (body || shown)) text = spoilerTagHtml(m, own, shown) + `<span class="mm-t" tabindex="-1" data-sp-text>${linkify(shown ? ctx.revealed[m.id] : body ?? '')}</span>`;
    // En una recomendación, «la otra persona»: quien la envía (si no eres tú) o a quien se la enviaste.
    const other = m.card?.type === 'rec' ? (m.author === ctx.me ? ctx.other ?? null : ctx.people[m.author ?? ''] ?? null) : null;
    const card = m.card ? cardHtml(m.card, ctx.people, { other, at: m.at, now }) : '';
    const cls = `${card ? ' has-card' : ''}${m.spoiler ? ' sp' : ''}`;
    return `<div class="mm${cls}" tabindex="-1" data-mid="${m.id}"${own ? ' data-own' : ''}>${t}${text}${card}${actionsHtml()}</div>`;
}

function pendingLineHtml(p: PendingMsg): string {
    const st = p.failed
        ? `<span class="mm-st err" role="alert">${icon('circle-alert')}<span>No se ha enviado.</span>`
            + `<button type="button" class="pf-btn sm" data-retry="${esc(p.clientId)}">${icon('refresh-cw')}Reintentar</button>`
            + `<button type="button" class="pf-btn sm ghost" data-discard="${esc(p.clientId)}">Borrar</button></span>`
        : `<span class="mm-st">${icon('clock')}Enviando…</span>`;
    const tag = p.spoiler ? `<div class="sp-r"><span class="sptag own">${icon('shield')}Spoiler · ${esc(spoilerLabel(p.spoiler))}</span></div>` : '';
    return `<div class="mm${p.failed ? '' : ' sending'}${p.spoiler ? ' sp' : ''}" data-cid="${esc(p.clientId)}">${tag}<span class="mm-t">${linkify(p.body)}</span>${st}</div>`;
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
        const line = m ? lineHtml(m, m.folded ? ctx.revealed[m.id] : m.body, own, ctx, now) : pendingLineHtml(it.p!);
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
