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

function btn(label: string, o: { kind?: string; icon?: string; sa?: string; pressed?: boolean; size?: 'sm' | 'md'; attrs?: string }): string {
    const cls = ['pf-btn', o.size === 'sm' ? 'sm' : '', o.kind ?? ''].filter(Boolean).join(' ');
    const pressed = o.pressed === undefined ? '' : ` aria-pressed="${o.pressed}"`;
    const sa = o.sa ? ` data-sa="${o.sa}"` : '';
    return `<button type="button" class="${cls}"${pressed}${sa}${o.attrs ? ' ' + o.attrs : ''}>${o.icon ? icon(o.icon) : ''}${esc(label)}</button>`;
}

/**
 * El botón de seguir según la relación, o '' si no se puede seguir (sin perfil activo).
 * «Siguiendo» lleva `aria-pressed="true"` y al pulsarlo deja de seguir.
 */
export function followButtonHtml(p: Pick<PersonCard, 'handle'>, rel: Relation, o: RelOpts): string {
    if (!o.phase.follow) return '';
    const size = o.size ?? 'sm';
    // Dejar de seguir siempre se puede, aunque esa persona haya apagado su perfil después.
    if (rel.iFollow) return btn('Siguiendo', { icon: 'check', pressed: true, sa: 'unfollow', size });
    if (!p.handle) return '';
    if (rel.followsMe) return btn('Seguir también', { kind: 'pri', icon: 'plus', pressed: false, sa: 'follow', size });
    // Con una solicitud enviada o ya amigos, la acción principal es la de amistad: Seguir va en gris.
    const quiet = o.phase.friends && (rel.requestOut || rel.friends);
    return btn('Seguir', { kind: quiet ? '' : 'pri', icon: 'plus', pressed: false, sa: 'follow', size });
}

/** Las acciones de una fila de persona (centro «Amigos», buscador). */
export function rowActionsHtml(p: PersonCard, rel: Relation, o: RelOpts & { isMe?: boolean }): string {
    if (o.isMe) return '';
    if (rel.blockedByMe) return btn('Desbloquear', { icon: 'shield-off', sa: 'unblock', size: 'sm' });
    if (o.phase.friends && rel.requestIn) {
        return btn('Aceptar', { kind: 'pri', icon: 'user-check', sa: 'friend-accept', size: 'sm' })
            + btn('Rechazar', { kind: 'ghost', sa: 'friend-reject', size: 'sm' });
    }
    return followButtonHtml(p, rel, { ...o, size: 'sm' });
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
    actions?: 'row' | 'cmdk';
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
    return `<div class="so-row${o.cls ? ' ' + o.cls : ''}" data-person="${esc(p.id)}" data-handle="${esc(p.handle ?? '')}" data-name="${esc(p.name)}">`
        + avatarHtml(p, o.avatarSize ?? 44)
        + `<div class="so-row-b"><div class="so-row-n">${nameHtml}${handleHtml}${tags}</div>`
        + (meta ? `<div class="so-row-m">${meta}</div>` : '')
        + `</div><div class="so-row-a" data-rel-host="${o.actions === 'cmdk' ? 'cmdk' : 'row'}">${acts}${o.extra ?? ''}</div></div>`;
}

// -------------------------------------------------------------------------------------
// Avisos de la campana (handoff §6.2). Dos formas: el de siempre (un enlace) y el social (con
// botones, así que no puede ser un enlace).
// -------------------------------------------------------------------------------------
const NOTIF_STAMP: Record<string, [StampColor, string]> = {
    new_episode: ['blue', 'tv'],
    person_release: ['red', 'clapperboard'],
    anniversary: ['purple', 'calendar-days'],
    on_platform: ['green', 'popcorn'],
    platform_change: ['green', 'popcorn'],
    streak: ['amber', 'flame'],
    follow: ['slate', 'user-plus'],
    friend_request: ['pink', 'handshake'],
    friend_accepted: ['pink', 'handshake'],
};
export const SOCIAL_NOTIF_TYPES = new Set(['follow', 'friend_request', 'friend_accepted']);

const POSTER_BASE = 'https://image.tmdb.org/t/p/w92';
const srOnly = (t: string) => `<span class="sr-only">${esc(t)}</span>`;

/** Línea de estado que sustituye a los botones cuando el aviso ya está resuelto. */
export function notifStatusHtml(text: string, o: { ok?: boolean; icon?: string; small?: string } = {}): string {
    return `<div class="nt-st${o.ok ? ' ok' : ''}">${icon(o.icon ?? (o.ok ? 'check' : 'x'))}<span>${esc(text)}</span>${o.small ? `<small>${esc(o.small)}</small>` : ''}</div>`;
}

/** Zona de acciones/estado de un aviso social según la relación ACTUAL (handoff §5.3). */
export function notifZoneHtml(it: Pick<NotifView, 'type' | 'actor' | 'rel'>, o: RelOpts & { mobile?: boolean }): { html: string; state: string } {
    const p = it.actor;
    const rel = it.rel;
    if (!p || !rel) return { html: '', state: '' };
    const size = o.mobile ? 'md' : 'sm';
    if (it.type === 'follow') {
        if (!p.handle || !o.phase.follow) return { html: '', state: '' };
        if (rel.iFollow) return { html: notifStatusHtml(`Ahora sigues a ${firstName(p.name)}`, { ok: true }), state: 'ya le sigues' };
        return { html: `<div class="nt-acts">${btn('Seguir también', { kind: 'pri', icon: 'plus', pressed: false, sa: 'follow', size })}</div>`, state: '' };
    }
    return { html: '', state: '' };
}

function socialSentence(it: NotifView): { html: string; plain: string } {
    const p = it.actor!;
    const name = p.handle
        ? `<a href="/u/${esc(p.handle)}" class="nt-who" data-notif-open><b>${esc(p.name)}</b></a>`
        : `<b>${esc(p.name)}</b>`;
    if (it.type === 'follow') return { html: `${name} te sigue`, plain: `${p.name} te sigue` };
    return { html: name, plain: p.name };
}

export function notifItemHtml(it: NotifView, o: RelOpts & { mobile?: boolean; now?: number }): string {
    const when = relTime(it.created_at, o.now);
    const unread = !it.read;
    const st = NOTIF_STAMP[it.type] ?? ['blue', 'bell'];

    if (SOCIAL_NOTIF_TYPES.has(it.type) && it.actor) {
        const s = socialSentence(it);
        const zone = notifZoneHtml(it, o);
        const label = [s.plain, zone.state, unread ? 'sin leer' : ''].filter(Boolean).join(', ');
        return `<div class="notif-item nt-social${unread ? ' is-unread' : ''}" role="article" aria-label="${esc(label)}" data-id="${esc(it.id)}" data-type="${esc(it.type)}" data-person="${esc(it.actor.id)}" data-handle="${esc(it.actor.handle ?? '')}" data-name="${esc(it.actor.name)}">`
            + avatarHtml(it.actor, 40, st)
            + `<div class="nt-b"><p class="nt-t">${s.html}</p><div class="nt-w">${esc(when)}</div>`
            + `<div class="nt-zone" data-rel-host="notif" aria-live="polite">${zone.html}</div></div>`
            + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '')
            + `</div>`;
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
