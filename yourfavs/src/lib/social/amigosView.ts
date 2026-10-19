/**
 * Marcado del centro «Amigos» (`/mislistas/amigos`, handoff social F2/F3 §7.1): el panel de cada
 * pestaña, sus vacíos y los resultados del buscador.
 *
 * Puro (sin DOM ni servidor), como `ui.ts`: la página pinta la pestaña inicial en el servidor y
 * `scripts/social/amigos.ts` pinta el resto (cambiar de pestaña, «Cargar más», buscar) con estas
 * mismas funciones.
 */
import { esc, icon, personRowHtml, relTime } from './ui';
import type { FriendsTab, PersonEntry, SocialPhaseFlags, StampColor } from './types';

export const TAB_LABEL: Record<FriendsTab, string> = {
    pendientes: 'Pendientes',
    amigos: 'Amigos',
    siguiendo: 'Siguiendo',
    seguidores: 'Seguidores',
    bloqueados: 'Bloqueados',
};

/** Pestañas visibles según la fase: Pendientes y Amigos llegan con la amistad (F3). */
export function tabsFor(phase: SocialPhaseFlags): FriendsTab[] {
    return phase.friends
        ? ['pendientes', 'amigos', 'siguiendo', 'seguidores', 'bloqueados']
        : ['siguiendo', 'seguidores', 'bloqueados'];
}

export interface ViewCtx {
    phase: SocialPhaseFlags;
    /** Tu dirección si tu perfil está activo (para «Ver mi perfil» y copiar el enlace). */
    myHandle: string | null;
    now?: number;
}

const stamp = (c: StampColor, i: string, size = 40) =>
    `<span class="so-emp-st" style="--sb:var(--stamp-${c});--si:var(--stamp-${c}-ink);width:${size}px;height:${size}px">${icon(i)}</span>`;

function emptyHtml(tab: FriendsTab, ctx: ViewCtx): string {
    const findBtn = (ic = 'user-plus') => `<button type="button" class="pf-btn sm" data-am-focus>${icon(ic)}Buscar personas</button>`;
    const E: Record<FriendsTab, [StampColor, string, string, string, string]> = {
        pendientes: ['amber', 'inbox', 'No tienes solicitudes por responder.', 'Cuando alguien te pida amistad, saldrá aquí y en la campana.', findBtn()],
        amigos: ['pink', 'handshake', 'Todavía no tienes amigos aquí.', 'Pásale tu enlace a alguien: si se registra desde él, te seguirá y podrá pedirte amistad.',
            ctx.myHandle ? `<button type="button" class="pf-btn pri sm" data-am-copy>${icon('link')}Copiar mi enlace</button>` : ''],
        siguiendo: ['slate', 'user-plus', 'No sigues a nadie.', 'Seguir es libre y no pide permiso. Busca por nombre o @dirección.', findBtn('search')],
        seguidores: ['blue', 'users', 'Nadie te sigue todavía.', 'Tu perfil tiene que estar activo para que te encuentren.',
            ctx.myHandle
                ? `<a class="pf-btn sm" href="/u/${esc(ctx.myHandle)}">${icon('eye')}Ver mi perfil</a>`
                : `<a class="pf-btn pri sm" href="/perfil/publico#direccion">${icon('at-sign')}Activar mi perfil</a>`],
        bloqueados: ['red', 'ban', 'No has bloqueado a nadie.', 'Bloquear se hace desde el perfil de cada persona, en «···». Nadie se entera.', ''],
    };
    const [c, i, title, text, action] = E[tab];
    return `<div class="so-emp">${stamp(c, i)}<span class="pf-tag">${TAB_LABEL[tab]}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`;
}

function rowMeta(tab: FriendsTab, e: PersonEntry, now: number): string[] {
    if (tab === 'bloqueados' && e.at) return [`bloqueado ${relTime(e.at, now)}`];
    return [];
}

/** Solo las filas (para «Cargar más», que las añade a la lista que ya hay). */
export function rowsHtml(tab: FriendsTab, items: PersonEntry[], ctx: ViewCtx): string {
    const now = ctx.now ?? Date.now();
    return items.map((e) => personRowHtml(e.person, e.rel, {
        phase: ctx.phase,
        meta: rowMeta(tab, e, now),
        hideArchetype: tab === 'bloqueados',
    })).join('');
}

export function moreButtonHtml(offset: number): string {
    return `<button type="button" class="pf-btn sm am-more" data-am-more="${offset}">Cargar más</button>`;
}

/** El panel entero de una pestaña. */
export function panelHtml(tab: FriendsTab, items: PersonEntry[], o: ViewCtx & { hasMore: boolean }): string {
    if (!items.length) return emptyHtml(tab, o);
    let html = `<div class="so-list">${rowsHtml(tab, items, o)}</div>`;
    if (o.hasMore) html += moreButtonHtml(items.length);
    if (tab === 'bloqueados') {
        const who = items.length === 1 ? esc(items[0].person.name.split(/\s+/)[0]) : 'Nadie';
        const verb = items.length === 1 ? 'no sabe que le has bloqueado' : 'sabe que le has bloqueado';
        html += `<p class="am-note">${icon('eye-off')}${who} ${verb}. Desbloquear no recupera los follows${o.phase.friends ? ' ni la amistad' : ''}.</p>`;
    }
    return html;
}

/** Resultados del buscador «Añadir amigo»: sustituyen a pestañas y panel mientras se busca. */
export function searchHtml(q: string, items: PersonEntry[], ctx: ViewCtx): string {
    const foot = `<p class="am-note">${icon('info')}¿No aparece? Puede que su perfil esté desactivado. Solo salen perfiles públicos.</p>`;
    if (!items.length) {
        return `<div class="am-grp">Perfiles · 0<hr></div><div class="so-emp is-flat"><h2>Nadie con «${esc(q)}».</h2></div>${foot}`;
    }
    const rows = items.map((e) => personRowHtml(e.person, e.rel, { phase: ctx.phase })).join('');
    return `<div class="am-grp">Perfiles · ${items.length}<span>por nombre y @dirección</span><hr></div><div class="so-list">${rows}</div>${foot}`;
}
