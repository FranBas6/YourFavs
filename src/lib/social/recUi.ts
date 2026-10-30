/**
 * Marcado de las recomendaciones (F4; handoff docs/design_handoff_social_f4 §5.3–5.5): el aviso de
 * la campana para quien recibe y para quien envía, las respuestas rápidas y las tarjetas del centro
 * «Amigos» → Pendientes.
 *
 * Puro (sin DOM ni servidor), como `ui.ts`: lo pintan las páginas en el servidor y lo repinta
 * `scripts/social/recActions.ts` tras actuar o responder. Estilos en `styles/components/recommend.css`.
 *
 * No es un chat: una sola respuesta por destinatario, sin burbujas ni hilos. El aviso de quien envía
 * no lleva el texto de la respuesta: enlaza a Pendientes → Enviadas.
 */
import { avatarHtml, btn, esc, firstName, icon, relTime } from './ui';
import { formatScore } from '../../utils/constants/helpers/media-helpers';
import { QUICK_TEXT, type NotifView, type PersonCard, type QuickKey, type RecReceived, type RecSent, type RecShown, type RecView } from './types';

const IMG = (size: 'w92' | 'w185', path: string) => `https://image.tmdb.org/t/p/${size}${path}`;

const KIND_LABEL: Record<RecView['targetType'], string> = { movie: 'Película', tv: 'Serie', person: 'Persona', company: 'Productora' };

/** Ficha del objeto recomendado (para «Ver productora» y enlaces). */
export function recHref(r: Pick<RecView, 'targetType' | 'targetId' | 'title'>): string {
    if (r.targetType === 'movie') return `/movie/${r.targetId}`;
    if (r.targetType === 'tv') return `/serie/${r.targetId}`;
    if (r.targetType === 'person') return `/actor/${r.targetId}`;
    return `/productora/${encodeURIComponent(r.title)}?companyId=${r.targetId}`;
}

/** Póster (película/serie), cara redonda (persona) o tesela con el nombre (productora). */
export function recLeadHtml(r: Pick<RecView, 'targetType' | 'title' | 'image'>, size: number): string {
    const st = `width:${size}px;height:${r.targetType === 'movie' || r.targetType === 'tv' ? Math.round(size * 1.5) : size}px`;
    if (r.targetType === 'company') {
        return `<span class="rc-lead is-logo" style="${st}" aria-hidden="true"><span>${esc(r.title)}</span></span>`;
    }
    const cls = r.targetType === 'person' ? 'rc-lead is-face' : 'rc-lead';
    const img = r.image ? `<img src="${IMG(size > 40 ? 'w185' : 'w92', esc(r.image))}" alt="" loading="lazy" decoding="async">` : icon(r.targetType === 'person' ? 'user' : 'film');
    return `<span class="${cls}" style="${st}" aria-hidden="true">${img}</span>`;
}

// -------------------------------------------------------------------------------------
// Respuestas rápidas (§5.4): botones, no burbujas. Una sola respuesta.
// -------------------------------------------------------------------------------------
const QUICK_SETS: Record<string, QuickKey[]> = {
    added: ['thanks', 'saving'],
    alerts: ['thanks', 'saving'],
    opened: ['thanks', 'saving', 'not_for_me'],
    discarded: ['thanks', 'seen_it', 'not_for_me'],
    had: ['thanks', 'seen_it'],
    seen: ['thanks', 'seen_it'],
};

export function replyText(r: RecView['reply']): string {
    if (!r) return '';
    return r.kind === 'quick' && r.key ? QUICK_TEXT[r.key] : r.text ?? '';
}

export function quickRowHtml(shown: RecShown, fromName: string): string {
    const keys = QUICK_SETS[shown];
    if (!keys) return '';
    return `<div class="qr" role="group" aria-label="Responder a ${esc(firstName(fromName))}">`
        + keys.map((k) => `<button type="button" class="qr-b" data-rq="${k}">${esc(QUICK_TEXT[k])}</button>`).join('')
        + `<button type="button" class="qr-l" data-rq-write>${icon('pencil')}Escribir algo…</button></div>`;
}

/** «Escribir algo…» abierto: una línea, Enter envía, hasta 140. */
export function replyWriteHtml(fromName: string): string {
    return `<div class="qr-w"><div class="qr-reply">`
        + `<input type="text" class="qr-in" maxlength="140" enterkeyhint="send" autocomplete="off" aria-label="Responder a ${esc(firstName(fromName))}, una sola vez">`
        + btn('', { kind: 'pri ico', icon: 'send', size: 'sm', attrs: 'data-rq-send aria-label="Enviar respuesta"' })
        + `</div><div class="qr-c"><button type="button" class="qr-x" data-rq-cancel>Cancelar</button><b class="qr-n" aria-live="polite">0/140</b></div></div>`;
}

const doneHtml = (text: string) => `<div class="qr-done">${icon('reply')}<span>Respondiste: «${esc(text)}»</span></div>`;

// -------------------------------------------------------------------------------------
// Zona del aviso / tarjeta según el estado (§5.3)
// -------------------------------------------------------------------------------------
const stHtml = (o: { ok?: boolean; icon: string; text: string; small?: string }) =>
    `<div class="nt-st${o.ok ? ' ok' : ''}">${icon(o.icon)}<span>${esc(o.text)}</span>${o.small ? `<small>${esc(o.small)}</small>` : ''}</div>`;

/** Botones de una recomendación aún pendiente. */
export function recActionsHtml(r: RecView, size: 'sm' | 'md'): string {
    const main = r.targetType === 'person'
        ? btn('Activar avisos de sus estrenos', { kind: 'pri', icon: 'bell', size, attrs: 'data-ra="alerts"' })
        : r.targetType === 'company'
            ? btn('Ver productora', { icon: 'building', size, attrs: `data-ra="open" data-href="${esc(recHref(r))}"` })
            : btn('Añadir a Pendientes', { kind: 'pri', icon: 'bookmark-plus', size, attrs: 'data-ra="add"' });
    return main + btn('Descartar', { kind: 'ghost', size, attrs: 'data-ra="discard"' });
}

const STATE_LABEL: Record<RecShown, string> = {
    pending: 'pendiente', added: 'añadida', alerts: 'avisos activados', opened: 'abierta',
    discarded: 'descartada', had: 'ya la tenías', seen: 'ya la viste',
};

/** Estado + respuestas (o la respuesta ya dada). Vacío si sigue pendiente (van los botones). */
export function recStatusHtml(r: RecView, fromName: string): string {
    const first = firstName(fromName);
    const s = r.shown;
    let head = '';
    if (s === 'added') head = stHtml({ ok: true, icon: 'check', text: 'Añadida a Pendientes' });
    else if (s === 'alerts') head = stHtml({ ok: true, icon: 'check', text: 'Avisos de sus estrenos activados' });
    else if (s === 'opened') head = stHtml({ ok: true, icon: 'check', text: 'Abierta' });
    else if (s === 'discarded') head = stHtml({ icon: 'x', text: 'Descartada.', small: r.reply ? '' : `${first} no lo sabrá si no respondes.` });
    else if (s === 'had') head = stHtml({ icon: 'info', text: r.targetType === 'person' ? 'Ya tenías activados sus avisos' : 'Ya la tenías en tus listas' });
    else if (s === 'seen') head = stHtml({ icon: 'eye', text: 'Ya la viste' });
    else return '';
    return head + (r.reply ? doneHtml(replyText(r.reply)) : quickRowHtml(s, fromName));
}

export function recAriaLabel(r: RecView, fromName: string, unread: boolean): string {
    return `Recomendación de ${fromName}: ${r.title}, ${STATE_LABEL[r.shown]}${r.reply ? ', respondida' : ''}${unread ? ', sin leer' : ''}`;
}

// -------------------------------------------------------------------------------------
// Avisos (§5.3)
// -------------------------------------------------------------------------------------
function recSentence(r: RecView, from: PersonCard): string {
    const who = from.handle ? `<a href="/u/${esc(from.handle)}" class="nt-who" data-notif-open><b>${esc(from.name)}</b></a>` : `<b>${esc(from.name)}</b>`;
    return r.targetType === 'person' ? `${who} te recomienda a <b>${esc(r.title)}</b>` : `${who} te recomienda <b>${esc(r.title)}</b>`;
}

export function recNotifHtml(it: NotifView, o: { mobile?: boolean; now?: number }): string {
    const r = it.rec!;
    const from = it.actor!;
    const unread = !it.read;
    const when = esc(relTime(it.created_at, o.now));
    if (it.type === 'rec_watched') {
        // F6, cierre del bucle: quien la recibió ya la vio. Lleva a la ficha, donde sale con su nota
        // en «Amigos que la han visto».
        const href = r.targetType === 'movie' ? `/movie/${r.targetId}` : `/serie/${r.targetId}`;
        const score = it.recScore != null ? ` (★ ${formatScore(it.recScore)})` : '';
        const plain = `${from.name} ha visto ${r.title}${score}, que le recomendaste`;
        return `<a href="${href}" class="notif-item nt-social${unread ? ' is-unread' : ''}" data-id="${esc(it.id)}" aria-label="${esc(plain + (unread ? ', sin leer' : ''))}">`
            + `<span class="rc-badged">${recLeadHtml(r, 34)}${avatarHtml(from, 20)}</span>`
            + `<div class="nt-b"><p class="nt-t"><b>${esc(from.name)}</b> ha visto <b>${esc(r.title)}</b>${esc(score)}, que le recomendaste</p>`
            + `<span class="nt-go">${icon('chevron-right')}Ver la ficha</span><div class="nt-w">${when}</div></div>`
            + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '') + `</a>`;
    }
    if (it.type === 'rec_reply') {
        // Para quien la envió: SIN el texto. Todo el aviso lleva a Pendientes → Enviadas.
        const href = `/mislistas/amigos?tab=pendientes#enviadas-${r.id}`;
        return `<a href="${href}" class="notif-item nt-social${unread ? ' is-unread' : ''}" data-id="${esc(it.id)}" aria-label="${esc(`${from.name} ha respondido a tu recomendación de ${r.title}${unread ? ', sin leer' : ''}`)}">`
            + avatarHtml(from, 40, ['amber', 'send'])
            + `<div class="nt-b"><p class="nt-t"><b>${esc(from.name)}</b> ha respondido a tu recomendación de <b>${esc(r.title)}</b></p>`
            + `<span class="nt-go">${icon('chevron-right')}Verla en Pendientes · Enviadas</span><div class="nt-w">${when}</div></div>`
            + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '') + `</a>`;
    }
    const pending = r.shown === 'pending' && !r.reply;
    const size = o.mobile ? 'md' : 'sm';
    const zone = pending ? `<div class="nt-acts">${recActionsHtml(r, size)}</div>` : recStatusHtml(r, from.name);
    return `<div class="notif-item nt-social nt-rec${unread ? ' is-unread' : ''}" role="article" aria-label="${esc(recAriaLabel(r, from.name, unread))}" data-id="${esc(it.id)}" data-rec="${r.id}" data-from="${esc(from.name)}">`
        + `<span class="rc-badged">${recLeadHtml(r, 34)}${avatarHtml(from, 20)}</span>`
        + `<div class="nt-b"><p class="nt-t">${recSentence(r, from)}</p>`
        + (r.message ? `<q class="rc-q">${esc(r.message)}</q>` : '')
        + `<div class="nt-w">${when}</div><div class="nt-zone" data-rec-zone aria-live="polite">${zone}</div></div>`
        + (unread ? '<span class="notif-dot" aria-hidden="true"></span>' : '') + `</div>`;
}

// -------------------------------------------------------------------------------------
// Tarjetas del centro «Amigos» → Pendientes (§5.5)
// -------------------------------------------------------------------------------------
const dot = '<span class="so-dot" aria-hidden="true"></span>';

export function recReceivedCardHtml(r: RecReceived, now = Date.now()): string {
    const pending = r.shown === 'pending' && !r.reply;
    return `<div class="rc" data-rec="${r.id}" data-from="${esc(r.from.name)}" role="article" aria-label="${esc(recAriaLabel(r, r.from.name, false))}">`
        + `<a href="${esc(recHref(r))}" class="rc-leadlink" tabindex="-1">${recLeadHtml(r, 46)}</a>`
        + `<div class="rc-b"><a class="rc-t" href="${esc(recHref(r))}">${esc(r.title)}</a>`
        + `<div class="rc-m"><span>${KIND_LABEL[r.targetType]}</span>${dot}${avatarHtml(r.from, 18)}<span>de ${esc(r.from.name)}</span>${dot}<span>${esc(relTime(r.createdAt, now))}</span></div>`
        + (r.message ? `<q class="rc-q">${esc(r.message)}</q>` : '')
        + `<div class="rc-zone" data-rec-zone aria-live="polite">${pending ? '' : recStatusHtml(r, r.from.name)}</div></div>`
        + `<div class="rc-a" data-rec-side>${pending ? recActionsHtml(r, 'sm') : ''}</div></div>`;
}

export function recSentCardHtml(r: RecSent, now = Date.now()): string {
    const lines = r.recipients.map((x) => {
        const st = x.visible === 'added'
            ? `<span class="stt ok">${icon('check')}La añadió a Pendientes</span>`
            : x.visible === 'alerts'
                ? `<span class="stt ok">${icon('check')}Activó los avisos</span>`
                : `<span class="stt">${icon('send')}Enviada</span>`;
        const rep = x.reply
            ? `<span class="rq">${icon('reply')}<q>${esc(replyText(x.reply))}</q><small>${esc(relTime(x.reply.at, now))}</small></span>`
            : '';
        return `<div>${avatarHtml(x.person, 22)}<b>${esc(firstName(x.person.name))}</b>${st}${rep}</div>`;
    }).join('');
    return `<div class="rc" id="enviadas-${r.id}">`
        + `<a href="${esc(recHref(r))}" class="rc-leadlink" tabindex="-1">${recLeadHtml(r, 46)}</a>`
        + `<div class="rc-b"><a class="rc-t" href="${esc(recHref(r))}">${esc(r.title)}</a>`
        + `<div class="rc-m"><span>${KIND_LABEL[r.targetType]}</span>${dot}<span>${esc(relTime(r.createdAt, now))}</span></div>`
        + (r.message ? `<q class="rc-q is-mine">Tu mensaje: «${esc(r.message)}»</q>` : '')
        + `<div class="rc-to">${lines}</div></div></div>`;
}
