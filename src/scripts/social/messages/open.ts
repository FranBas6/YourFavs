/**
 * «Enviar mensaje» / «Mensaje» (`[data-msg-to="{uid}"]`, handoff de mensajes §8): abre el 1:1 con
 * ese amigo —el que ya existe o uno nuevo— y va a la conversación. Se carga con la capa social
 * (`SocialLayer.astro`) en cualquier página con sesión.
 */
import { msgApi } from './api';
import { showToast } from '../toast';

document.addEventListener('click', async (e) => {
    const btn = (e.target as Element).closest?.<HTMLButtonElement>('[data-msg-to]');
    if (!btn || btn.getAttribute('aria-busy') === 'true') return;
    e.preventDefault();
    btn.setAttribute('aria-busy', 'true');
    const r = await msgApi.openDirect({ userId: btn.dataset.msgTo! });
    btn.removeAttribute('aria-busy');
    if (r.ok) { location.href = `/mislistas/amigos/mensajes/${r.data.id}`; return; }
    showToast(r.status === 429 ? 'Vas muy rápido. Espera un momento.' : 'No se ha podido abrir la conversación.', 'error');
});
