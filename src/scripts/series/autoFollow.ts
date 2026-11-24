/**
 * «Ahora sigues X · Deshacer» (QA 2.4, H31). Marcar un episodio de una serie que no está en ninguna de
 * tus listas la pasa a Siguiendo (`followIfUnlisted`, services/series/serieLibrary.ts) para que el
 * progreso aparezca en Siguiendo, «Estás viendo» y tu perfil. Este módulo lo cuenta y deja deshacerlo.
 *
 * Llega por el evento `yf:auto-follow` (detalle opcional `{ id, name }`): lo lanzan los scripts de la
 * temporada y del episodio (la API devuelve `autoFollowed`) y `public/js/optimistic-actions.js` en la
 * ficha (el servidor redirige a `?seguida=1`). Sin JavaScript, la ficha se recarga con `?seguida=1` y el
 * aviso sale al cargar. Los datos por defecto, de `[data-auto-follow]` de la página.
 */
import { showToast } from '../social/toast';

const host = () => document.querySelector<HTMLElement>('[data-auto-follow]');

async function undo(id: string, name: string): Promise<void> {
    const fd = new FormData();
    fd.set('id', id);
    fd.set('actionType', 'siguiendo');
    fd.set('action', 'remove');
    try {
        const r = await fetch(`/serie/${id}`, { method: 'POST', body: fd });
        if (!r.ok && !r.redirected) throw new Error(String(r.status));
        showToast(`${name} ya no está en Siguiendo`);
    } catch {
        showToast('No se ha podido deshacer', 'error');
    }
}

function announce(detail?: { id?: string | number; name?: string }): void {
    const id = String(detail?.id ?? host()?.dataset.id ?? '');
    const name = detail?.name || host()?.dataset.name || 'la serie';
    if (!id) return;
    showToast(`Ahora sigues ${name}: te diremos qué episodio te toca`, 'success', () => { void undo(id, name); });
}

document.addEventListener('yf:auto-follow', (e) => announce((e as CustomEvent).detail));

// Sin JavaScript en el envío (o tras recargar): el servidor dejó `?seguida=1` en la URL.
const url = new URL(location.href);
if (url.searchParams.get('seguida') === '1') {
    url.searchParams.delete('seguida');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    announce();
}
