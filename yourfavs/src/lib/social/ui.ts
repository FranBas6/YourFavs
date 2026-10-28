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
    const d = Math.floor(h / 24);
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

export function notifItemHtml(it: NotifView, o: RelOpts & { mobile?: boolean; now?: number }): string {
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
        + `<span class="notif-ico" style="${stampVars(st[0])}">${icon(st[1])}</span>${poster}`
        + `<span class="notif-body"><span class="notif-sub">${esc(it.subtitle)}</span><span class="notif-name">${esc(it.title)}</span><span class="notif-when">${esc(when)}</span></span>`
        + (unread ? `<span class="notif-dot" aria-hidden="true"></span>${srOnly('sin leer')}` : '')
        + `</a>`;
}

/** Grupos «Hoy / Esta semana / Antes» conservando el orden (ya llegan del más nuevo al más viejo). */
export function notifGroups<T extends { created_at: number }>(items: T[], now = Date.now()): [string, T[]][] {
    const DAY = 86400000;
    const groups: [string, T[]][] = [];
    for (const it of items) {
        const age = now - it.created_at;
        const label = age < DAY ? 'Hoy' : age < 7 * DAY ? 'Esta semana' : 'Antes';
        if (!groups.length || groups[groups.length - 1][0] !== label) groups.push([label, []]);
        groups[groups.length - 1][1].push(it);
    }
    return groups;
}
