/**
 * Marcado de las piezas sociales: avatar, botones de relación, fila de persona y aviso de la
 * campana (handoff docs/design_handoff_social_f2_f3 §6).
 *
 * Funciones PURAS que devuelven HTML: sin DOM ni nada de servidor. Las usan las páginas en el
 * servidor (`set:html`) y los scripts del navegador para repintar tras una acción o pintar
 * resultados de búsqueda, así que una fila o un aviso se ven exactamente igual en los dos sitios.
 * Los estilos están en `styles/components/social-ui.css` (global).
 *
 * Todo lo que viene del usuario pasa por `esc()`.
 */
import { ICONS } from './icons';
import type { NotifView, PersonCard, Relation, SocialPhaseFlags, StampColor } from './types';
import { recNotifHtml } from './recUi';

export function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function icon(name: string, cls = ''): string {
    const body = ICONS[name] ?? ICONS.info;
    return `<svg viewBox="0 0 24 24" width="1em" height="1em"${cls ? ` class="${cls}"` : ''} aria-hidden="true">${body}</svg>`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// -------------------------------------------------------------------------------------
// Tiempo relativo («hace 2 h», «ayer», «hace 3 días»…)
// -------------------------------------------------------------------------------------
export function relTime(ms: number, now = Date.now()): string {
    const s = Math.max(0, (now - ms) / 1000);
    if (s < 60) return 'ahora';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    // Días de calendario en España (7.3): «ayer» es el día de antes, no «entre 24 y 48 horas», para
    // que case con los grupos «Hoy · Ayer · Esta semana» de la campana.
    const [a, b] = [madridDay(ms), madridDay(now)].map((x) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)));
    const d = Math.max(1, Math.round((b - a) / 86400000));
    if (d === 1) return 'ayer';
    if (d < 7) return `hace ${d} días`;
    const w = Math.floor(d / 7);
    if (d < 30) return w === 1 ? 'hace 1 semana' : `hace ${w} semanas`;
    const mo = Math.floor(d / 30);
    if (d < 365) return mo === 1 ? 'hace 1 mes' : `hace ${mo} meses`;
    const y = Math.floor(d / 365);
    return y === 1 ? 'hace 1 año' : `hace ${y} años`;
}

// -------------------------------------------------------------------------------------
// Avatar: la foto o las iniciales sobre un stamp (handoff §6.1)
// -------------------------------------------------------------------------------------
const STAMPS: StampColor[] = ['red', 'amber', 'blue', 'green', 'purple', 'pink', 'slate'];

/** Color estable por persona: siempre el mismo para el mismo id, entre los 7 stamps. */
export function stampFor(id: string): StampColor {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return STAMPS[Math.abs(h) % STAMPS.length];
}

export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const stampVars = (c: StampColor, p = 's') => `--${p}b:var(--stamp-${c});--${p}i:var(--stamp-${c}-ink)`;

export function avatarHtml(p: PersonCard, size = 44, badge?: [StampColor, string]): string {
    const font = Math.round(size * 0.32);
    const inner = p.avatar
        ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async">`
        : esc(p.initials);
    const bdg = badge ? `<span class="so-av-bdg" style="${stampVars(badge[0], 'b')}">${icon(badge[1])}</span>` : '';
    return `<span class="so-av" style="${stampVars(p.color)};width:${size}px;height:${size}px;font-size:${font}px" aria-hidden="true">${inner}${bdg}</span>`;
}

// -------------------------------------------------------------------------------------
// Botones de relación (handoff §6.1, tabla «Botones por relación»)
// -------------------------------------------------------------------------------------
export type RelCtx = 'row' | 'profile' | 'cmdk' | 'notif';
export interface RelOpts {
    phase: SocialPhaseFlags;
    /** `sm` en filas, avisos y ⌘K (34 px; 44 en móvil). `md` en la cabecera del perfil. */
    size?: 'sm' | 'md';
}

export function btn(label: string, o: { kind?: string; icon?: string; sa?: string; pressed?: boolean; size?: 'sm' | 'md'; attrs?: string }): string {
    const cls = ['pf-btn', o.size === 'sm' ? 'sm' : '', o.kind ?? ''].filter(Boolean).join(' ');
    const pressed = o.pressed === undefined ? '' : ` aria-pressed="${o.pressed}"`;
    const sa = o.sa ? ` data-sa="${o.sa}"` : '';
    return `<button type="button" class="${cls}"${pressed}${sa}${o.attrs ? ' ' + o.attrs : ''}>${o.icon ? icon(o.icon) : ''}${esc(label)}</button>`;
}

/**
 * El botón de seguir según la relación, o '' si no se puede seguir (sin perfil activo).
 * «Siguiendo» lleva `aria-pressed="true"` y al pulsarlo deja de seguir.
 */
export function followButtonHtml(p: Pick<PersonCard, 'handle'>, rel: Relation, o: RelOpts & { quiet?: boolean }): string {
    if (!o.phase.follow) return '';
    const size = o.size ?? 'sm';
    // Dejar de seguir siempre se puede, aunque esa persona haya apagado su perfil después.
    if (rel.iFollow) return btn('Siguiendo', { icon: 'check', pressed: true, sa: 'unfollow', size });
    if (!p.handle) return '';
    if (rel.followsMe) return btn('Seguir también', { kind: 'pri', icon: 'plus', pressed: false, sa: 'follow', size });
    // Con una solicitud enviada o ya amigos, la acción principal es la de amistad: Seguir va en gris.
    const quiet = o.quiet || (o.phase.friends && (rel.requestOut || rel.friends));
    return btn('Seguir', { kind: quiet ? '' : 'pri', icon: 'plus', pressed: false, sa: 'follow', size });
}

// ---- Amistad (F3) -----------------------------------------------------------------------
const menuWrap = (toggle: string, items: string) =>
    `<span class="pf-menu-wrap">${toggle}<div class="pf-menu" role="menu" hidden>${items}</div></span>`;

function menuToggle(label: string, o: { kind?: string; icon?: string; size?: 'sm' | 'md'; ico?: boolean }): string {
    const cls = ['pf-btn', o.size === 'sm' ? 'sm' : '', o.kind ?? '', o.ico ? 'ico' : ''].filter(Boolean).join(' ');
    const body = o.ico ? icon('ellipsis') : `${o.icon ? icon(o.icon) : ''}${esc(label)}${icon('chevron-down', 'pf-car')}`;
    return `<button type="button" class="${cls}" aria-haspopup="menu" aria-expanded="false" data-menu-toggle${o.ico ? ` aria-label="${esc(label)}"` : ''}>${body}</button>`;
}

/** Botón o fila «Enviar mensaje» (M1): abre el 1:1 con ese amigo (`scripts/social/messages/open.ts`). */
const msgAttrs = (p: Pick<PersonCard, 'id' | 'name'>) => `data-msg-to="${esc(p.id)}"`;

/** Menú de un amigo: Ver perfil · Enviar mensaje (M1) · Recomendar algo (F4) · Eliminar amigo, con lo que implica. */
function friendMenuItems(p: Pick<PersonCard, 'id' | 'handle' | 'name'>, rel: Relation, o: RelOpts, withProfileLink: boolean): string {
    const first = firstName(p.name);
    const keeps = rel.iFollow && rel.followsMe ? 'Seguiréis siguiéndoos. ' : rel.iFollow ? 'Le seguirás siguiendo. ' : '';
    return (withProfileLink && p.handle ? `<a role="menuitem" href="/u/${esc(p.handle)}">${icon('user')}Ver perfil</a>` : '')
        + (o.phase.messages ? `<button type="button" role="menuitem" ${msgAttrs(p)}>${icon('message-circle')}Enviar mensaje</button>` : '')
        + (o.phase.recommend && p.handle
            ? `<button type="button" role="menuitem" data-recommend data-to="${esc(p.handle)}">${icon('send')}Recomendar algo</button>`
            : `<button type="button" role="menuitem" aria-disabled="true" class="is-soon">${icon('send')}Recomendar algo<span class="so-soon">Pronto</span></button>`)
        + '<hr>'
        + `<button type="button" role="menuitem" class="pf-danger" data-sa="friend-remove">${icon('user-minus')}Eliminar de amigos</button>`
        + `<small>${esc(keeps)}${esc(first)} no recibe aviso.</small>`;
}

/**
 * El botón de amistad según la relación, o '' si no aplica:
 * «Añadir amigo» · «Solicitud enviada ▾» (Cancelar) · «Amigos ▾» (menú del amigo).
 * La solicitud recibida no va aquí: se pinta como Aceptar / Rechazar.
 */
export function friendButtonHtml(p: Pick<PersonCard, 'id' | 'handle' | 'name'>, rel: Relation, o: RelOpts & { primary?: boolean }): string {
    if (!o.phase.friends || rel.blockedByMe || rel.requestIn) return '';
    const size = o.size ?? 'sm';
    if (rel.friends) {
        return menuWrap(menuToggle('Amigos', { kind: 'friend', icon: 'user-check', size }), friendMenuItems(p, rel, o, true));
    }
    if (rel.requestOut) {
        return menuWrap(menuToggle('Solicitud enviada', { kind: 'wait', icon: 'clock', size }),
            `<button type="button" role="menuitem" data-sa="friend-cancel">${icon('x')}Cancelar solicitud</button>`);
    }
    if (!p.handle) return '';
    return btn('Añadir amigo', { kind: o.primary ? 'pri' : '', icon: 'user-plus', sa: 'friend-request', size });
}

const acceptRejectHtml = (size: 'sm' | 'md', acceptLabel = 'Aceptar') =>
    btn(acceptLabel, { kind: 'pri', icon: 'user-check', sa: 'friend-accept', size })
    + btn('Rechazar', { kind: 'ghost', sa: 'friend-reject', size });

export type RowActions = 'row' | 'cmdk' | 'friendRow' | 'sent';

/** Las acciones de una fila de persona (centro «Amigos», buscador). */
export function rowActionsHtml(p: PersonCard, rel: Relation, o: RelOpts & { isMe?: boolean; actions?: RowActions }): string {
    if (o.isMe) return '';
    if (rel.blockedByMe) return btn('Desbloquear', { icon: 'shield-off', sa: 'unblock', size: 'sm' });
    // Pestaña «Pendientes», grupo «Enviadas».
    if (o.actions === 'sent' && rel.requestOut) return btn('Cancelar solicitud', { icon: 'x', sa: 'friend-cancel', size: 'sm' });
    // Pestaña «Amigos»: «Ver perfil» a la vista (con mensajes, «Mensaje»: el perfil sigue en el
    // nombre y en el menú) y lo demás en «···».
    if (o.actions === 'friendRow' && rel.friends) {
        const lead = o.phase.messages
            ? `<button type="button" class="pf-btn sm" ${msgAttrs(p)}>${icon('message-circle')}Mensaje</button>`
            : p.handle ? `<a class="pf-btn sm ghost" href="/u/${esc(p.handle)}">Ver perfil</a>` : '';
        return lead
            + menuWrap(menuToggle('Más opciones', { size: 'sm', ico: true }), friendMenuItems(p, rel, o, true));
    }
    if (o.phase.friends && rel.requestIn) return acceptRejectHtml('sm');
    return followButtonHtml(p, rel, { ...o, size: 'sm' }) + friendButtonHtml(p, rel, { ...o, size: 'sm' });
}

/**
 * Las acciones de la cabecera del perfil público para quien tiene sesión (handoff perfil público
 * §7, social §6.1). `locked`: perfil «Solo amigos» visto por quien no lo es (D4): la amistad pasa
 * delante y es la acción principal. El invitado lo pinta `ProfileActions.astro` (abre el acceso).
 */
export function profileActionsHtml(p: Pick<PersonCard, 'id' | 'handle' | 'name'>, rel: Relation, o: RelOpts & { locked?: boolean }): string {
    const first = firstName(p.name);
    const md = { ...o, size: 'md' as const };
    if (rel.blockedByMe) return `<div class="pf-acts-row">${btn('Desbloquear', { icon: 'shield-off', sa: 'unblock', size: 'md' })}</div>`;
    const received = o.phase.friends && rel.requestIn;
    let row = '';
    if (received) row += acceptRejectHtml('md', 'Aceptar solicitud');
    const follow = followButtonHtml(p, rel, { ...md, quiet: o.locked });
    const friend = friendButtonHtml(p, rel, { ...md, primary: o.locked });
    row += o.locked ? friend + follow : follow + friend;
    if (o.phase.messages && rel.friends) {
        row += `<button type="button" class="pf-btn pf-ico-mobile" ${msgAttrs(p)} aria-label="Enviar mensaje a ${esc(first)}">${icon('message-circle')}<span class="pf-lbl-wide">Enviar mensaje</span></button>`;
    }
    if (o.phase.recommend && rel.friends && p.handle) {
        row += `<button type="button" class="pf-btn pf-ico-mobile" data-recommend data-to="${esc(p.handle)}" aria-haspopup="dialog" aria-expanded="false" aria-label="Recomendar a ${esc(first)}">${icon('send')}<span class="pf-lbl-wide">Recomendar</span></button>`;
    }
    if (o.phase.block && !o.locked) {
        row += menuWrap(menuToggle('Más opciones', { ico: true }),
            `<button type="button" role="menuitem" data-action="copy-link">${icon('link')}Copiar enlace</button><hr>`
            + `<button type="button" role="menuitem" class="pf-danger" data-sa="block">${icon('ban')}Bloquear a ${esc(first)}</button>`);
    }
    const req = received ? `<div class="pf-req">${icon('user-plus')}${esc(first)} te ha enviado una solicitud de amistad.</div>` : '';
    return `${req}<div class="pf-acts-row"${received ? ' style="margin-top: 12px"' : ''}>${row}</div>`;
}

/** ⌘K: un único botón, el de seguir, y solo si aún no le sigues (handoff §7.5). */
export function cmdkActionsHtml(p: PersonCard, rel: Relation, o: RelOpts): string {
    if (rel.iFollow || rel.blockedByMe) return '';
    return followButtonHtml(p, rel, { ...o, size: 'sm' });
}

// -------------------------------------------------------------------------------------
// Fila de persona (handoff §6.1)
// -------------------------------------------------------------------------------------
export interface RowOpts extends RelOpts {
    isMe?: boolean;
    /** Texto(s) tras el arquetipo: «hace 3 h», «bloqueado hace 2 semanas»… */
    meta?: string[];
    /** Sin arquetipo (bloqueados y «Tú»). */
    hideArchetype?: boolean;
    avatarSize?: number;
    /** Clase extra (p. ej. `is-hl` en ⌘K). */
    cls?: string;
    /** HTML extra al final de las acciones (el ↵ de ⌘K). */
    extra?: string;
    actions?: RowActions;
}

export function relationTags(rel: Relation, o: { isMe?: boolean; phase: SocialPhaseFlags }): string[] {
    if (o.isMe) return ['Tú'];
    const tags: string[] = [];
    if (o.phase.friends && rel.friends) tags.push('Amigos');
    else if (rel.followsMe && !rel.blockedByMe) tags.push('Te sigue');
    return tags;
}

export function personRowHtml(p: PersonCard, rel: Relation, o: RowOpts): string {
    const tags = relationTags(rel, o).map((t) => `<span class="pf-tag">${esc(t)}</span>`).join('');
    const nameHtml = p.handle
        ? `<a class="so-row-name" href="/u/${esc(p.handle)}">${esc(p.name)}</a>`
        : `<span class="so-row-name">${esc(p.name)}</span>`;
    const handleHtml = p.handle ? `<span class="so-row-h">@${esc(p.handle)}</span>` : '';
    const arch = !o.hideArchetype && !o.isMe && !rel.blockedByMe && p.archetype
        ? `<span class="so-arch">${icon(p.archetype.icon)}${esc(p.archetype.name)}</span>` : '';
    const meta = [arch, ...(o.meta ?? []).map((m) => `<span>${esc(m)}</span>`)].filter(Boolean)
        .join('<span class="so-dot" aria-hidden="true"></span>');
    const acts = o.actions === 'cmdk' ? cmdkActionsHtml(p, rel, o) : rowActionsHtml(p, rel, o);
    const host = o.actions === 'cmdk' ? 'cmdk' : 'row';
    return `<div class="so-row${o.cls ? ' ' + o.cls : ''}" data-person="${esc(p.id)}" data-handle="${esc(p.handle ?? '')}" data-name="${esc(p.name)}">`
        + avatarHtml(p, o.avatarSize ?? 44)
        + `<div class="so-row-b"><div class="so-row-n">${nameHtml}${handleHtml}${tags}</div>`
        + (meta ? `<div class="so-row-m">${meta}</div>` : '')
        + `</div><div class="so-row-a" data-rel-host="${host}" data-acts="${o.actions ?? 'row'}">${acts}${o.extra ?? ''}</div></div>`;
}

// -------------------------------------------------------------------------------------
// Avisos de la campana (handoff §6.2). Dos formas: el de siempre (un enlace) y el social (con
// botones, así que no puede ser un enlace).
// -------------------------------------------------------------------------------------
const NOTIF_STAMP: Record<string, [StampColor, string]> = {
    new_episode: ['blue', 'tv'],
    new_season: ['blue', 'tv'],
    premiere: ['red', 'ticket'],
    person_release: ['red', 'clapperboard'],
    anniversary: ['purple', 'calendar-days'],
    on_platform: ['green', 'popcorn'],
    platform_change: ['green', 'popcorn'],
    streak: ['amber', 'flame'],
    follow: ['slate', 'user-plus'],
    friend_request: ['pink', 'handshake'],
    friend_accepted: ['pink', 'handshake'],
    recommendation: ['amber', 'send'],
    rec_reply: ['amber', 'send'],
    rec_watched: ['pink', 'eye'],
    plan_changed: ['green', 'calendar-clock'],
    plan_cancelled: ['green', 'calendar-x'],
    plan_today: ['green', 'calendar-check'],
};
export const SOCIAL_NOTIF_TYPES = new Set(['follow', 'friend_request', 'friend_accepted', 'recommendation', 'rec_reply', 'rec_watched']);
const PLAN_NOTIF_TYPES = new Set(['plan_today', 'plan_changed', 'plan_cancelled']);

const POSTER_BASE = 'https://image.tmdb.org/t/p/w92';
const srOnly = (t: string) => `<span class="sr-only">${esc(t)}</span>`;

/** Línea de estado que sustituye a los botones cuando el aviso ya está resuelto. */
export function notifStatusHtml(text: string, o: { ok?: boolean; icon?: string; small?: string } = {}): string {
    return `<div class="nt-st${o.ok ? ' ok' : ''}">${icon(o.icon ?? (o.ok ? 'check' : 'x'))}<span>${esc(text)}</span>${o.small ? `<small>${esc(o.small)}</small>` : ''}</div>`;
}

/** Zona de acciones/estado de un aviso social según la relación ACTUAL (handoff §5.3). */
export function notifZoneHtml(it: Pick<NotifView, 'type' | 'actor' | 'rel' | 'req'>, o: RelOpts & { mobile?: boolean }): { html: string; state: string } {
    const p = it.actor;
    const rel = it.rel;
    if (!p || !rel) return { html: '', state: '' };
    const size = o.mobile ? 'md' : 'sm';
    const first = firstName(p.name);
    if (it.type === 'follow') {
        if (!p.handle || !o.phase.follow) return { html: '', state: '' };
        if (rel.iFollow) return { html: notifStatusHtml(`Ahora sigues a ${first}`, { ok: true }), state: 'ya le sigues' };
        return { html: `<div class="nt-acts">${btn('Seguir también', { kind: 'pri', icon: 'plus', pressed: false, sa: 'follow', size })}</div>`, state: '' };
    }
    if (it.type === 'friend_request') {
        if (rel.friends || it.req === 'accepted') return { html: notifStatusHtml('Ahora sois amigos', { ok: true }), state: 'aceptada' };
        if (it.req === 'pending' && rel.requestIn) return { html: `<div class="nt-acts">${acceptRejectHtml(size)}</div>`, state: 'pendiente' };
        if (it.req === 'rejected') return { html: notifStatusHtml('Solicitud rechazada.', { small: `${first} no recibe ningún aviso.` }), state: 'rechazada' };
        return { html: notifStatusHtml('Esta solicitud ya no está pendiente.', { icon: 'info' }), state: 'ya no está pendiente' };
    }
    if (it.type === 'friend_accepted') {
        return rel.friends ? { html: notifStatusHtml('Ahora sois amigos', { ok: true }), state: '' } : { html: '', state: '' };
    }
    return { html: '', state: '' };
}

/** La frase del aviso social. Sin dato de género, formas neutras (handoff §8). */
export function notifSentenceHtml(it: Pick<NotifView, 'type' | 'actor' | 'req'>): { html: string; plain: string } {
    const p = it.actor!;
    const name = p.handle
        ? `<a href="/u/${esc(p.handle)}" class="nt-who" data-notif-open><b>${esc(p.name)}</b></a>`
        : `<b>${esc(p.name)}</b>`;
    if (it.type === 'follow') return { html: `${name} te sigue`, plain: `${p.name} te sigue` };
    if (it.type === 'friend_request') {
        // Ya resuelta, en pasado.
        const verb = it.req === 'pending' ? 'te ha pedido amistad' : 'te pidió amistad';
        return { html: `${name} ${verb}`, plain: `Solicitud de amistad de ${p.name}` };
    }
    if (it.type === 'friend_accepted') return { html: `${name} ha aceptado tu solicitud`, plain: `${p.name} ha aceptado tu solicitud` };
    return { html: name, plain: p.name };
}

export function notifItemHtml(it: NotifView, o: RelOpts & { mobile?: boolean; now?: number; nested?: boolean }): string {
    const when = relTime(it.created_at, o.now);
    const unread = !it.read;
    const st = NOTIF_STAMP[it.type] ?? ['blue', 'bell'];
    // Recomendaciones (F4): su propio marcado, en recUi.ts.
    if ((it.type === 'recommendation' || it.type === 'rec_reply' || it.type === 'rec_watched') && it.rec && it.actor) return recNotifHtml(it, o);

    if (SOCIAL_NOTIF_TYPES.has(it.type) && it.actor) {
        const s = notifSentenceHtml(it);
        const zone = notifZoneHtml(it, o);
        const label = [s.plain, zone.state, unread ? 'sin leer' : ''].filter(Boolean).join(', ');
        return `<div class="notif-item nt-social${unread ? ' is-unread' : ''}" role="article" aria-label="${esc(label)}" data-id="${esc(it.id)}" data-type="${esc(it.type)}" data-req="${esc(it.req ?? '')}" data-person="${esc(it.actor.id)}" data-handle="${esc(it.actor.handle ?? '')}" data-name="${esc(it.actor.name)}">`
            + avatarHtml(it.actor, 40, st)
            + `<div class="nt-b"><p class="nt-t">${s.html}</p><div class="nt-w">${esc(when)}</div>`
            + `<div class="nt-zone" data-rel-host="notif" aria-live="polite">${zone.html}</div></div>`
            + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '')
            + `</div>`;
    }

    // Planes (M5, handoff §3.6): informativos, con el póster y su sello; todo el aviso lleva al chat.
    if (PLAN_NOTIF_TYPES.has(it.type)) {
        const today = it.type === 'plan_today';
        const img = it.poster_path ? `<img src="${POSTER_BASE}${esc(it.poster_path)}" alt="" loading="lazy">` : icon('film');
        const title = today ? esc(it.title).replace(/^Hoy:/, '<b>Hoy:</b>') : esc(it.title);
        const line = today ? it.subtitle : [when, it.subtitle].filter(Boolean).join(' · ');
        const label = (today ? `Plan de hoy: ${it.title.replace(/^Hoy:\s*/, '')}` : it.title) + (unread ? ', sin leer' : '');
        return `<a href="${esc(it.href || '#')}" class="notif-item nt-social nt-plan${unread ? ' is-unread' : ''}" data-id="${esc(it.id)}" aria-label="${esc(label)}">`
            + `<span class="rc-badged"><span class="rc-lead" style="width:34px;height:51px" aria-hidden="true">${img}</span>`
            + `<span class="so-av-bdg" style="${stampVars(st[0], 'b')}" aria-hidden="true">${icon(st[1])}</span></span>`
            + `<div class="nt-b"><p class="nt-t">${title}</p><div class="nt-w nt-pl-w">${icon(st[1])}<span>${esc(line)}</span></div>`
            + (today ? `<span class="pf-btn${o.mobile ? '' : ' sm'} nt-pl-go">${icon('message-circle')}Abrir chat</span>` : '')
            + `</div>` + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '') + `</a>`;
    }

    const poster = it.poster_path
        ? `<img class="notif-poster" src="${POSTER_BASE}${esc(it.poster_path)}" alt="" loading="lazy">`
        : '<span class="notif-poster"></span>';
    return `<a href="${esc(it.href || '#')}" class="notif-item${unread ? ' is-unread' : ''}" data-id="${esc(it.id)}">`
        + (o.nested ? '' : `<span class="notif-ico" style="${stampVars(st[0])}">${icon(st[1])}</span>`) + poster
        + (o.nested
            // Dentro de un grupo (7.3): solo lo que cambia. Sin la hora (la lleva el grupo) y, en plataformas,
            // sin «Ya en Netflix» (también): «Lupin · de tu lista».
            ? `<span class="notif-body"><span class="notif-name">${esc(it.title)}</span><span class="notif-sub">${esc(it.type === 'platform_change' ? (/ · (.+)$/.exec(it.subtitle || '')?.[1] ?? it.subtitle) : it.subtitle)}</span></span>`
            : `<span class="notif-body"><span class="notif-sub">${esc(it.subtitle)}</span><span class="notif-name">${esc(it.title)}</span><span class="notif-when">${esc(when)}</span></span>`)
        + (unread ? `<span class="notif-dot" aria-hidden="true"></span>${srOnly('sin leer')}` : '')
        + `</a>`;
}

// -------------------------------------------------------------------------------------
// Avisos agrupados (rediseño 7.3, handoff P8): mismo tipo y mismo día = un aviso
// -------------------------------------------------------------------------------------
/** Día de calendario en España (el servidor va en UTC): «2026-11-04». */
const madridDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ms);

/** Categoría de un aviso, para los filtros y el resumen de la semana. */
export type NotifCat = 'episodios' | 'plataformas' | 'personas' | 'estrenos' | 'amigos' | 'otros';
export function notifCat(type: string): NotifCat {
    if (type === 'new_episode' || type === 'new_season') return 'episodios';
    if (type === 'platform_change' || type === 'on_platform') return 'plataformas';
    if (type === 'person_release') return 'personas';
    if (type === 'premiere' || type === 'anniversary') return 'estrenos';
    if (SOCIAL_NOTIF_TYPES.has(type) || PLAN_NOTIF_TYPES.has(type)) return 'amigos';
    return 'otros';
}
export const NOTIF_CATS: [NotifCat, string, string][] = [
    ['episodios', 'Episodios', 'tv'], ['plataformas', 'Plataformas', 'popcorn'], ['personas', 'Personas', 'clapperboard'],
    ['estrenos', 'Estrenos', 'ticket'], ['amigos', 'Amigos', 'users'],
];

/** Solo se juntan los avisos de títulos; los sociales y los planes van siempre sueltos (tienen botones). */
const GROUPABLE = new Set(['new_episode', 'new_season', 'platform_change', 'person_release', 'premiere']);
const PLATFORM_RE = /^(Ya en|Salió de) (.+?) · (.+)$/;

export interface NotifBundle { bundle: true; key: string; type: string; items: NotifView[]; created_at: number; read: boolean }
export type NotifEntry = NotifView | NotifBundle;
export const isBundle = (e: NotifEntry): e is NotifBundle => (e as NotifBundle).bundle === true;

/**
 * Junta los avisos del mismo tipo y del mismo día (y, en plataformas, de la misma plataforma y sentido:
 * «Ya en Netflix»). Con uno solo, el aviso queda suelto. El orden se conserva: el grupo va donde estaba
 * su aviso más nuevo. Solo cambia cómo se pintan: en la base siguen siendo avisos sueltos.
 */
export function bundleNotifs(items: NotifView[]): NotifEntry[] {
    const out: NotifEntry[] = [];
    const byKey = new Map<string, NotifBundle>();
    for (const it of items) {
        if (!GROUPABLE.has(it.type)) { out.push(it); continue; }
        const m = it.type === 'platform_change' ? PLATFORM_RE.exec(it.subtitle || '') : null;
        const key = [it.type, madridDay(it.created_at), m ? `${m[1]}|${m[2]}` : ''].join('|');
        let b = byKey.get(key);
        if (!b) {
            b = { bundle: true, key, type: it.type, items: [], created_at: it.created_at, read: true };
            byKey.set(key, b);
            out.push(b);
        }
        b.items.push(it);
        if (!it.read) b.read = false;
    }
    return out.map((e) => (isBundle(e) && e.items.length === 1 ? e.items[0] : e));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const listNames = (names: string[], max = 3) => {
    const u = [...new Set(names.filter(Boolean))];
    if (u.length <= max) return u.length > 1 ? `${u.slice(0, -1).join(', ')} y ${u[u.length - 1]}` : (u[0] ?? '');
    return `${u.slice(0, max).join(', ')} y ${u.length - max} más`;
};

/** La frase de un grupo: «Ya en Netflix: 12 títulos», «Nuevos episodios en 3 series»… */
function bundleText(b: NotifBundle): { html: string; plain: string; more: string } {
    const n = b.items.length;
    const titles = b.items.map((i) => i.title);
    if (b.type === 'platform_change') {
        const m = PLATFORM_RE.exec(b.items[0].subtitle || '');
        const head = m ? `${m[1]} ${m[2]}` : 'Cambios de plataforma';
        const orig = { fav: 0, like: 0, list: 0 };
        for (const it of b.items) {
            const q = PLATFORM_RE.exec(it.subtitle || '')?.[3] ?? '';
            if (/favorit/.test(q)) orig.fav++; else if (/gust/.test(q)) orig.like++; else orig.list++;
        }
        const parts = [orig.fav ? `${orig.fav} de tus favoritos` : '', orig.like ? `${orig.like} que te ${orig.like === 1 ? 'gustó' : 'gustaron'}` : '', orig.list ? `${orig.list} de tu lista` : ''].filter(Boolean);
        // Un solo origen: «Ya en Netflix: 16 de tus favoritos» (handoff P8). Varios: «12 títulos · 9 de tus favoritos, 3 de tu lista».
        const what = parts.length === 1 ? parts[0] : `${plural(n, 'título', 'títulos')} · ${parts.join(', ')}`;
        return { html: `<b>${esc(head)}</b>: ${esc(what)}`, plain: `${head}: ${what}`, more: listNames(titles) };
    }
    if (b.type === 'new_episode') {
        const series = [...new Set(titles)];
        if (series.length === 1) {
            const plain = `${n} episodios nuevos de ${series[0]}`;
            return { html: `<b>${n} episodios nuevos</b> de ${esc(series[0])}`, plain, more: listNames(b.items.map((i) => (i.subtitle || '').split(' · ')[0])) };
        }
        return { html: `<b>Nuevos episodios</b> en ${series.length} series`, plain: `Nuevos episodios en ${series.length} series`, more: listNames(series) };
    }
    if (b.type === 'new_season') return { html: `<b>Temporadas nuevas</b> en ${n} series`, plain: `Temporadas nuevas en ${n} series`, more: listNames(titles) };
    if (b.type === 'person_release') {
        const people = b.items.map((i) => (i.subtitle || '').split(' · ')[0].replace(/ y \d+ más$/, ''));
        return { html: `<b>${plural(n, 'estreno', 'estrenos')}</b> de personas que sigues`, plain: `${plural(n, 'estreno', 'estrenos')} de personas que sigues`, more: listNames(people) };
    }
    return { html: `<b>${plural(n, 'estreno', 'estrenos')}</b> de tu lista`, plain: `${plural(n, 'estreno', 'estrenos')} de tu lista`, more: listNames(titles) };
}

/** Un grupo: sello, pila de pósters, frase y, al abrirlo, sus avisos sueltos. Abrirlo los da por leídos. */
export function notifBundleHtml(b: NotifBundle, o: RelOpts & { mobile?: boolean; now?: number }): string {
    const st = NOTIF_STAMP[b.type] ?? ['blue', 'bell'];
    const t = bundleText(b);
    const posters = b.items.filter((i) => i.poster_path).slice(0, 4);
    const extra = b.items.length - posters.length;
    const stack = posters.length
        ? `<span class="nt-stk" aria-hidden="true">${posters.map((i) => `<img src="${POSTER_BASE}${esc(i.poster_path!)}" alt="" loading="lazy">`).join('')}${extra > 0 ? `<em>+${extra}</em>` : ''}</span>`
        : '';
    const unread = b.items.filter((i) => !i.read).length;
    const label = `${t.plain}: ${t.more}${unread ? `, ${unread} sin leer` : ''}`;
    return `<details class="nt-grp${unread ? ' is-unread' : ''}" data-grp-ids="${esc(b.items.map((i) => i.id).join(','))}">`
        + `<summary class="nt-grp-s" aria-label="${esc(label)}">`
        + `<span class="notif-ico" style="${stampVars(st[0])}">${icon(st[1])}</span>`
        + `<span class="notif-body"><span class="nt-grp-t">${t.html}</span><span class="notif-sub">${esc(t.more)}</span>`
        + `<span class="notif-when">${esc(relTime(b.created_at, o.now))} · <span class="nt-grp-more">Ver ${b.items.length === 2 ? 'los 2' : `los ${b.items.length}`}</span></span></span>`
        + stack
        + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '')
        + `<span class="nt-grp-car">${icon('chevron-down')}</span>`
        + `</summary><div class="nt-grp-b">${b.items.map((it) => notifItemHtml(it, { ...o, nested: true })).join('')}</div></details>`;
}

/**
 * La lista entera, como la pintan la campana y la página: por días («Hoy · Ayer · Esta semana ·
 * Antes»), con los avisos agrupados. Cada pieza lleva `data-cat` para los filtros de la página.
 */
export function notifFeedHtml(items: NotifView[], o: RelOpts & { mobile?: boolean; now?: number; wrap?: (label: string, html: string) => string }): string {
    const now = o.now ?? Date.now();
    const wrap = o.wrap ?? ((label, html) => `<p class="notif-group">${label}</p>${html}`);
    return notifGroups(bundleNotifs(items), now).map(([label, entries]) => wrap(label, entries.map((e) => {
        const cat = notifCat(e.type);
        const html = isBundle(e) ? notifBundleHtml(e, { ...o, now }) : notifItemHtml(e, { ...o, now });
        // La categoría va en el elemento raíz (el primer class="notif-item…" o "nt-grp").
        return html.replace(/class="(notif-item|nt-grp)/, `data-cat="${cat}" class="$1`);
    }).join(''))).join('');
}

/** Grupos «Hoy · Ayer · Esta semana · Antes» por día de calendario en España, conservando el orden. */
export function notifGroups<T extends { created_at: number }>(items: T[], now = Date.now()): [string, T[]][] {
    const DAY = 86400000;
    const today = madridDay(now);
    const yesterday = madridDay(now - DAY);
    const groups: [string, T[]][] = [];
    for (const it of items) {
        const d = madridDay(it.created_at);
        const label = d === today ? 'Hoy' : d === yesterday ? 'Ayer' : now - it.created_at < 7 * DAY ? 'Esta semana' : 'Antes';
        if (!groups.length || groups[groups.length - 1][0] !== label) groups.push([label, []]);
        groups[groups.length - 1][1].push(it);
    }
    return groups;
}
