/**
 * Marcado del mini-chat (Mensajes M6; handoff docs/Mensajes/design_handoff_m6, medidas de m6.css).
 *
 * Solo el marco: la ventanita (`.mw`) con su cabecera y la barra minimizada (`.mwm`). Dentro va la
 * conversación de siempre: el registro (`logHtml`) y el compositor (`composerHtml`) de `chatView.ts`,
 * en talla compacta por CSS. `chat.ts` la encuentra por los mismos `data-ms-*` que en la página.
 */
import { avatarHtml, esc, icon } from './ui';
import { GONE, chatSubtitle, composerHtml, emptyHtml, gavHtml, groupFaces, logHtml, newAnchor, otherOf } from './chatView';
import type { ChatView, ConvSummary, PersonCard } from './types';

/** Lo que pinta la cabecera y la barra: sale de una conversación cargada o de su fila en la lista. */
export interface MiniHead {
    id: number;
    group: boolean;
    title: string;
    sub: string;
    faces: PersonCard[];
    muted: boolean;
}

export const headOfChat = (chat: ChatView): MiniHead => ({
    id: chat.id, group: chat.kind === 'group', title: chat.title, sub: chatSubtitle(chat),
    faces: chat.kind === 'group' ? groupFaces(chat) : [otherOf(chat)], muted: chat.me.muted,
});

export const headOfConv = (c: ConvSummary): MiniHead => ({
    id: c.id, group: c.kind === 'group', title: c.title,
    sub: c.kind === 'group' ? `${c.count} personas` : '', faces: c.faces, muted: c.muted,
});

export const miniLabel = (h: Pick<MiniHead, 'group' | 'title'>) => (h.group ? `Conversación del grupo ${h.title}` : `Conversación con ${h.title}`);
const lead = (h: MiniHead, size: number) => (h.group ? gavHtml(h.faces, size) : avatarHtml(h.faces[0] ?? GONE, size));
const bigHref = (id: number) => `/mislistas/amigos/mensajes/${id}`;
const ico = (label: string, name: string, attrs: string) =>
    `<button type="button" class="pf-btn ico" aria-label="${label}" title="${label}" ${attrs}>${icon(name)}</button>`;

/** El asa de la esquina para cambiar el tamaño (miniChat.ts la mueve; también con las flechas). */
const RESIZE = `<button type="button" class="mw-rs" aria-label="Cambiar el tamaño de la ventanita: arrastra, o usa las flechas. Doble clic: tamaño normal" title="Arrastra para cambiar el tamaño · doble clic: tamaño normal" data-mw-resize>${icon('move-diagonal-2')}</button>`;

function headHtml(h: MiniHead): string {
    return RESIZE + `<header class="mw-h">${lead(h, 32)}`
        + `<div class="tx"><b><span data-ms-title>${esc(h.title)}</span><span class="mw-mute" title="Silenciada" data-ms-muted-ico${h.muted ? '' : ' hidden'}>${icon('bell-off')}</span></b>`
        + `<span data-ms-sub>${esc(h.sub)}</span></div>`
        + `<div class="acts">`
        + `<a class="pf-btn ico" href="${bigHref(h.id)}" aria-label="Abrir en grande" title="Abrir en grande" data-mw-big>${icon('maximize-2')}</a>`
        + ico('Información y opciones', 'ellipsis', 'aria-haspopup="menu" aria-expanded="false" data-mw-more')
        + ico('Minimizar', 'minus', 'data-mw-min')
        + ico('Cerrar', 'x', 'data-mw-close')
        + `</div></header>`;
}

/** El menú «···» de la cabecera. */
export function miniMenuHtml(h: MiniHead, muted: boolean): string {
    const item = (name: string, label: string, attrs: string, cls = '') =>
        `<button type="button" role="menuitem"${cls ? ` class="${cls}"` : ''} ${attrs}>${icon(name)}${esc(label)}</button>`;
    return item('info', h.group ? 'Información y personas' : 'Información', 'data-mw-info')
        + item('bell-off', muted ? 'Quitar silencio' : 'Silenciar', 'data-mw-mute')
        + `<a role="menuitem" href="${bigHref(h.id)}" data-mw-big>${icon('maximize-2')}Abrir en grande</a>`
        + (h.group ? `<hr>${item('log-out', 'Salir del grupo', 'data-mw-leave', 'pf-danger')}` : '');
}

/** La ventanita abierta con su conversación. */
export function miniWindowHtml(chat: ChatView): string {
    const h = headOfChat(chat);
    const group = chat.kind === 'group';
    const log = logHtml(chat.messages, {
        me: chat.me.id, group, people: chat.people, newAfter: newAnchor(chat.messages, chat.me.id, chat.me.lastReadId),
        seenId: chat.seenId, seenAt: chat.seenAt, pending: [], revealed: {}, compact: true, other: group ? null : otherOf(chat),
    });
    return `<section class="mw" role="region" aria-label="${esc(miniLabel(h))}" data-mw-win data-conv="${chat.id}">`
        + headHtml(h)
        + `<div class="ms-log" role="log" aria-label="Mensajes" tabindex="0" data-ms-log-scroll>`
        + `<div class="ms-older" data-ms-older hidden>Cargando mensajes anteriores…</div>`
        + `<div class="ms-log-in" data-ms-log>${log}</div></div>`
        + `<div class="sr-only" aria-live="polite" data-ms-live></div>`
        + composerHtml(chat)
        + `<div class="pf-menu ms-mmenu" role="menu" aria-label="Acciones del mensaje" hidden data-ms-menu></div>`
        + `<div class="pf-menu mw-menu" role="menu" aria-label="Opciones de la conversación" hidden data-mw-menu></div>`
        + `</section>`;
}

/** La ventanita mientras carga, sin nada guardado: barras grises y el compositor en espera. */
export function miniLoadingHtml(h: MiniHead): string {
    const bar = (ws: number[]) => `<div><i class="a"></i><span class="l">${ws.map((w) => `<i style="width:${w}%"></i>`).join('')}</span></div>`;
    return `<section class="mw" role="region" aria-label="${esc(miniLabel(h))}" aria-busy="true" data-mw-win data-conv="${h.id}">`
        + headHtml(h)
        + `<div class="sk" aria-hidden="true">${bar([62, 40])}${bar([80])}${bar([46, 70])}</div>`
        + `<div class="ms-c"><div class="ms-ro" role="status">${icon('message-circle')}<div><b>Cargando la conversación</b><span>Podrás escribir en un momento.</span></div></div></div>`
        + `</section>`;
}

/** La ventanita cuando la conversación ya no se puede ver (handoff §2.6). */
export function miniGoneHtml(h: MiniHead, why: 'left' | 'none' | 'error'): string {
    const body = why === 'left'
        ? emptyHtml({ color: 'slate', icon: 'log-out', title: 'Ya no estás en este grupo', text: 'No puedes ver sus mensajes.', actions: `<button type="button" class="pf-btn sm" data-mw-close>Cerrar</button>` })
        : why === 'none'
        ? emptyHtml({ color: 'slate', icon: 'lock', title: 'Esta conversación ya no está disponible', text: 'Puede que se haya borrado. Tus otras conversaciones siguen en Mensajes.', actions: `<a class="pf-btn sm" href="/mislistas/amigos/mensajes">Ver mensajes</a><button type="button" class="pf-btn sm" data-mw-close>Cerrar</button>` })
        : emptyHtml({ color: 'red', icon: 'wifi-off', title: 'No se ha podido cargar', text: 'Revisa tu conexión.', actions: `<button type="button" class="pf-btn pri sm" data-mw-retry>${icon('refresh-cw')}Reintentar</button><button type="button" class="pf-btn sm" data-mw-close>Cerrar</button>` });
    return `<section class="mw" role="region" aria-label="${esc(miniLabel(h))}" data-mw-win data-conv="${h.id}">`
        + headHtml(h) + `<div class="mw-emp">${body}</div></section>`;
}

/** La barra minimizada: toda ella abre; la ✕ cierra. */
export function miniBarHtml(h: MiniHead, unread: number): string {
    const n = h.muted ? 0 : unread;
    const label = `${miniLabel(h)}, minimizada${n ? `, ${n} sin leer` : ''}`;
    return `<div class="mwm${n ? ' un' : ''}" role="region" aria-label="${esc(label)}" data-mw-bar data-conv="${h.id}">`
        + `<button type="button" class="mwm-open" aria-label="Abrir: ${esc(label)}" data-mw-open>${lead(h, 26)}<b>${esc(h.title)}</b>`
        + (n ? `<span class="new">${n === 1 ? 'Nuevo' : 'Nuevos'}</span><span class="cv-n" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : '')
        + `<span class="mwm-up" aria-hidden="true">${icon('chevron-up')}</span></button>`
        + ico('Cerrar', 'x', 'data-mw-close')
        + `</div>`;
}
