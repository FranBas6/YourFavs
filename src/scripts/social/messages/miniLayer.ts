/**
 * Capas dentro del mini-chat (Mensajes M6; handoff M6 §2.1 y §2.4).
 *
 * Los selectores del ＋ (`#ck` de cardPick y `#pk` de planPick) y la información de la conversación,
 * cuando se abren desde la ventanita, no flotan anclados a un botón: ocupan la ventanita bajo su
 * cabecera, con «‹ Volver al chat» encima. El mismo elemento se MUEVE dentro y, al cerrar, vuelve a
 * su sitio en la página (así los selectores no cambian y en la página grande todo sigue igual).
 */
import { icon } from '../../../lib/social/ui';

/** La ventanita del mini-chat que contiene `el`, o null. */
export const miniWindowOf = (el: Element | null | undefined) => el?.closest<HTMLElement>('[data-mw-win]') ?? null;

/**
 * Mete `el` como capa en la ventanita de `anchor` (si está en una). `onBack`: «Volver al chat».
 * Devuelve cómo deshacerlo, o null si `anchor` no está en el mini-chat.
 */
export function intoMiniLayer(el: HTMLElement, anchor: Element | null | undefined, onBack: () => void): (() => void) | null {
    const host = miniWindowOf(anchor);
    if (!host) return null;
    // Su sitio en la página, para devolverlo al cerrar (lo creado al vuelo no tiene: se quita).
    const mark = el.parentNode ? document.createComment('mw-layer') : null;
    if (mark) el.before(mark);
    const layer = document.createElement('div');
    layer.className = 'mw-layer';
    layer.setAttribute('data-mw-layer', '');
    layer.innerHTML = `<button type="button" class="mw-back" data-mw-back>${icon('chevron-left')}Volver al chat</button>`;
    layer.querySelector('[data-mw-back]')!.addEventListener('click', onBack);
    layer.append(el);
    el.classList.add('in-layer');
    host.append(layer);
    return () => {
        el.classList.remove('in-layer');
        if (mark?.isConnected) mark.replaceWith(el);
        else if (mark) document.body.append(el);
        else el.remove();
        layer.remove();
    };
}
