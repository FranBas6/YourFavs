/**
 * Panel «¿Qué vemos?» de una conversación (Mensajes M4d; handoff M4 §3.6), sobre el aspecto de la
 * ruleta «¿Qué veo?»: `<dialog>` modal en escritorio y hoja en móvil.
 *
 *   · «Quién viene» (solo en grupos): todas las personas marcadas, tú siempre, al menos 2.
 *   · «Tiempo»: como en «¿Qué veo?» (las series, por episodios, siempre caben).
 *   · Las tiradas son PRIVADAS: solo las ve quien tira. «Otra» no tiene límite y no repite lo de esta
 *     sesión. «Enviar» publica la tirada como tarjeta (cada envío, una nueva).
 *   · Sin nada de las N, la mejor de N−1, y se dice (sin decir quién falta). Sin nada: vacío útil.
 *   · Con «reducir movimiento», sin la espera de «Tirando…»: el resultado aparece con un fundido corto.
 *
 * Se abre con cualquier `[data-wtw-open-chat]` (el ＋ y el «Tirar otra vez» de las tarjetas).
 */
import { avatarHtml, btn, esc, firstName, icon } from '../../../lib/social/ui';
import { titleMeta, wtwCount } from '../../../lib/social/chatView';
import { showToast } from '../toast';
import type { ChatMessage, ChatView, PersonCard, WtwCardRef } from '../../../lib/social/types';

const POSTER = (p: string) => `https://image.tmdb.org/t/p/w185${p}`;
const TIMES = [['60', '< 1 h'], ['150', '~2 h'], ['any', 'El que sea']] as const;

type Roll = { empty: true; of: number } | { empty: false; roll: WtwCardRef; tier: 'all' | 'minus'; restart: boolean };

export function initWtw(o: { conv: number; chat: ChatView; onSent: (m: ChatMessage) => void }) {
    const dlg = document.getElementById('ms-wtw') as HTMLDialogElement | null;
    if (!dlg) return;
    const me = o.chat.me.id;
    const group = o.chat.kind === 'group';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Personas: tú primero y luego el resto, por orden de llegada.
    const people: PersonCard[] = [
        ...o.chat.members.filter((m) => m.person.id === me).map((m) => m.person),
        ...o.chat.members.filter((m) => m.person.id !== me).map((m) => m.person),
    ];
    const nameOf = (id: string) => people.find((p) => p.id === id);

    const who = new Set(people.map((p) => p.id));
    let time: (typeof TIMES)[number][0] = 'any';
    let rolled: string[] = [];
    let cur: Roll | null = null;
    let busy = false;
    let opener: HTMLElement | null = null;

    // ---- Pintar ----------------------------------------------------------------------------------
    const stamp = (color: string, name: string, size = 40) =>
        `<span class="tc-st wv-st" style="--sb:var(--stamp-${color});--si:var(--stamp-${color}-ink);width:${size}px;height:${size}px" aria-hidden="true">${icon(name)}</span>`;
    const faces = (ids: string[]) =>
        `<span class="fcs" aria-hidden="true">${ids.map(nameOf).filter((p): p is PersonCard => Boolean(p)).slice(0, 6).map((p) => avatarHtml(p, 22)).join('')}</span>`;

    function filtersHtml(): string {
        const whoHtml = group
            ? `<div><div class="lb" id="wv-who-l">Quién viene</div><div class="wv-ch" role="group" aria-labelledby="wv-who-l">`
                + people.map((p) => {
                    const on = who.has(p.id);
                    const mine = p.id === me;
                    return `<button type="button" class="p${on ? ' on' : ''}" role="checkbox" aria-checked="${on}"${mine ? ' aria-disabled="true"' : ''} data-wv-who="${esc(p.id)}">`
                        + `${avatarHtml(p, 24)}${mine ? 'Tú' : esc(firstName(p.name))}</button>`;
                }).join('') + `</div></div>`
            : '';
        const timeHtml = `<div><div class="lb" id="wv-time-l">Tiempo</div><div class="wv-ch" role="radiogroup" aria-labelledby="wv-time-l">`
            + TIMES.map(([k, l]) => `<button type="button" class="${time === k ? 'on' : ''}" role="radio" aria-checked="${time === k}" data-wv-time="${k}">${l}</button>`).join('')
            + `</div></div>`;
        return whoHtml + timeHtml;
    }

    function bodyHtml(): string {
        const sendTo = group ? 'Enviar al grupo' : `Enviar a ${firstName(people.find((p) => p.id !== me)?.name ?? '')}`;
        if (busy || !cur) {
            return `<div class="wv-k">${reduce.matches ? '' : `${icon('dice-5')}`}Tirando…</div>`
                + `<div class="wv-c roll" aria-hidden="true"><span class="po"></span><div><div class="t">&nbsp;</div><div class="m">&nbsp;</div></div></div>`;
        }
        if (cur.empty) {
            const n = cur.of;
            const text = n >= 3
                ? `Ni de los ${n} ni de ${n - 1} de ${n}. Compartid títulos en el chat y añadidlos a Pendientes${group ? ', o quita a alguien de «Quién viene»' : ''}.`
                : 'Compartid títulos en el chat y añadidlos a Pendientes.';
            return `<div class="so-emp wv-emp">${stamp('slate', 'dice-5', 44)}<h4>No tenéis nada pendiente en común</h4><p>${esc(text)}</p>`
                + `<div class="wv-ea">`
                + btn('Compartir un título', { kind: 'pri', icon: 'clapperboard', size: 'sm', attrs: `data-wv-share` })
                + `<a class="pf-btn sm" href="/mislistas/pendientes?roulette=1">${icon('dice-5')}Mi «¿Qué veo?»</a></div></div>`;
        }
        const r = cur.roll;
        const n = r.have.length;
        const note = cur.tier === 'minus'
            ? `<p class="wv-note" role="note">${icon('info')}<span>No hay ninguna pendiente de los ${r.of}. Esta es la mejor de ${n} de ${r.of}.</span></p>`
            : '';
        const again = cur.restart ? `<p class="wv-note">${icon('refresh-cw')}<span>Ya habían salido todas: vuelven a salir.</span></p>` : '';
        const poster = r.poster ? `<img src="${POSTER(esc(r.poster))}" alt="" decoding="async">` : icon(r.mediaType === 'movie' ? 'film' : 'tv');
        return `<div class="wv-k">${faces(r.have)}<span>${esc(wtwCount(n, r.of))}</span></div>${note}${again}`
            + `<div class="wv-c${reduce.matches ? ' fade' : ''}"><a class="po" href="/${r.mediaType === 'movie' ? 'movie' : 'serie'}/${r.tmdbId}" tabindex="-1" aria-hidden="true">${poster}</a>`
            + `<div class="wv-cb"><div class="t">${esc(r.title)}</div><div class="m">${esc(titleMeta(r))}</div>`
            + `<div class="a">${btn(sendTo, { kind: 'pri', icon: 'send', size: 'sm', attrs: 'data-wv-send' })}`
            + `${btn('Quedar para verla', { icon: 'calendar-plus', size: 'sm', attrs: 'data-wv-plan' })}`
            + `${btn('Otra', { icon: 'dice-5', size: 'sm', attrs: 'data-wv-again' })}</div></div></div>`
            + `<p class="wv-pv">${icon('eye-off')}<span>Solo tú ves las tiradas. ${group ? 'Al grupo' : `A ${esc(firstName(people.find((p) => p.id !== me)?.name ?? ''))}`} le llega la que envíes.</span></p>`;
    }

    function render() {
        dlg!.innerHTML = `<div class="wv-hd" aria-hidden="true"></div>`
            + `<div class="wv-h">${stamp('purple', 'dice-5')}<div class="tx"><h3 id="ms-wtw-t">¿Qué vemos?</h3>`
            + `<p>Con lo que tenéis pendiente en «${esc(o.chat.title)}»</p></div>`
            + `<button type="button" class="x" data-wv-close aria-label="Cerrar">${icon('x')}</button></div>`
            + `<div class="wv-f">${filtersHtml()}</div>`
            + `<div class="wv-b" aria-live="polite" data-wv-body>${bodyHtml()}</div>`;
    }
    const repaintBody = () => { const b = dlg.querySelector('[data-wv-body]'); if (b) b.innerHTML = bodyHtml(); };

    // ---- Tirar y enviar ----------------------------------------------------------------------------
    async function roll() {
        busy = true;
        repaintBody();
        const started = Date.now();
        let r: Roll | null = null;
        try {
            const res = await fetch(`/api/social/messages/${o.conv}/wtw/roll`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ who: [...who], maxRuntime: time === 'any' ? null : Number(time), exclude: rolled }),
            });
            const d = await res.json();
            if (res.ok && d.ok) r = d as Roll;
        } catch { /* sin red */ }
        // Un instante de «Tirando…» (sin él con «reducir movimiento»).
        if (!reduce.matches) await new Promise((ok) => setTimeout(ok, Math.max(0, 450 - (Date.now() - started))));
        busy = false;
        if (!r) { cur = null; dlg!.querySelector('[data-wv-body]')!.innerHTML = `<p class="wv-note">${icon('wifi-off')}<span>No se ha podido tirar. Prueba otra vez.</span></p>${btn('Tirar', { kind: 'pri', icon: 'dice-5', size: 'sm', attrs: 'data-wv-again' })}`; return; }
        cur = r;
        if (!r.empty) {
            const k = `${r.roll.mediaType}:${r.roll.tmdbId}`;
            if (r.restart) rolled = [];
            if (!rolled.includes(k)) rolled.push(k);
        }
        repaintBody();
    }

    async function send(b: HTMLButtonElement) {
        if (!cur || cur.empty) return;
        b.disabled = true;
        let d: any = null;
        let res: Response | null = null;
        try {
            res = await fetch(`/api/social/messages/${o.conv}/wtw/send`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ who: [...who], mediaType: cur.roll.mediaType, tmdbId: cur.roll.tmdbId }),
            });
            d = await res.json();
        } catch { /* sin red */ }
        if (!res?.ok || !d?.ok) {
            b.disabled = false;
            showToast(d?.error === 'gone' ? 'Ese título ya no está pendiente de todos. Tira otra vez.' : 'No se ha podido enviar. Inténtalo otra vez.', 'error');
            return;
        }
        dlg!.close();
        o.onSent(d.message as ChatMessage);
    }

    function open(from: HTMLElement | null) {
        opener = from;
        rolled = [];
        cur = null;
        render();
        dlg!.showModal();
        void roll();
    }

    // ---- Eventos -----------------------------------------------------------------------------------
    document.addEventListener('click', (e) => {
        const t = e.target as Element;
        const from = t.closest<HTMLElement>('[data-wtw-open-chat]');
        if (from && !dlg.contains(from)) { e.preventDefault(); open(document.querySelector<HTMLElement>('[data-ms-plus]') ?? from); }
    });
    dlg.addEventListener('click', (e) => {
        const t = e.target as Element;
        if (t === dlg) { dlg.close(); return; } // el fondo
        if (t.closest('[data-wv-close]')) { dlg.close(); return; }
        const w = t.closest<HTMLElement>('[data-wv-who]');
        if (w) {
            const id = w.dataset.wvWho!;
            if (id === me) return;
            if (who.has(id)) {
                if (who.size <= 2) { showToast('Hacen falta al menos 2 personas.', 'error'); return; }
                who.delete(id);
            } else who.add(id);
            w.classList.toggle('on', who.has(id));
            w.setAttribute('aria-checked', String(who.has(id)));
            rolled = [];
            void roll();
            return;
        }
        const tm = t.closest<HTMLElement>('[data-wv-time]');
        if (tm) {
            time = tm.dataset.wvTime as typeof time;
            dlg.querySelectorAll<HTMLElement>('[data-wv-time]').forEach((b) => {
                const on = b === tm;
                b.classList.toggle('on', on);
                b.setAttribute('aria-checked', String(on));
            });
            rolled = [];
            void roll();
            return;
        }
        if (t.closest('[data-wv-again]')) { void roll(); return; }
        // M5: de la tirada a un plan. Llega al chat UNA tarjeta, la del plan, con «Salió en ¿Qué vemos?».
        if (t.closest('[data-wv-plan]') && cur && !cur.empty) {
            const r = cur.roll;
            dlg.close();
            void import('./planPick').then((m) => m.openPlanPick({
                conv: o.conv, source: 'wtw', wtw: { of: r.of, have: r.have.length },
                title: { type: r.mediaType, id: r.tmdbId, title: r.title, image: r.poster ?? null },
                anchor: document.querySelector<HTMLElement>('[data-ms-plus]'),
            }));
            return;
        }
        const s = t.closest<HTMLButtonElement>('[data-wv-send]');
        if (s) { void send(s); return; }
        if (t.closest('[data-wv-share]')) {
            // Del vacío a «Compartir un título»: se cierra el panel y se abre el selector del ＋.
            dlg.close();
            document.querySelector<HTMLElement>('#ms-pm [data-share-title]')?.click();
        }
    });
    dlg.addEventListener('close', () => {
        dlg.innerHTML = '';
        if (opener?.isConnected) opener.focus();
    });
}
