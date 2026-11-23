/**
 * «Seguir saga» sin recargar (2026-11-23, C2). El botón es un formulario POST (`SagaFollowButton.astro`):
 * sin sesión lo intercepta antes el AuthModal (fase de captura) y aquí no llega. Con sesión se manda en
 * JSON, se cambia el estado y sale un aviso con «Deshacer». Si falla, el botón vuelve a como estaba.
 *
 * Varios botones de la misma saga en la página (cabecera y bloque) se mantienen iguales.
 */
import { showToast } from '../social/toast';

const FORM = 'form[data-saga-follow]';

function setState(id: string, following: boolean): void {
    for (const f of document.querySelectorAll<HTMLFormElement>(FORM)) {
        if (f.querySelector<HTMLInputElement>('input[name="collection_id"]')?.value !== id) continue;
        const btn = f.querySelector<HTMLButtonElement>('button');
        const label = f.querySelector<HTMLElement>('[data-saga-follow-label]');
        const action = f.querySelector<HTMLInputElement>('input[name="op"]');
        const compact = !!btn?.classList.contains('saga-follow--c');
        btn?.setAttribute('aria-pressed', following ? 'true' : 'false');
        if (label) label.textContent = following ? 'Siguiendo' : (compact ? 'Seguir' : 'Seguir saga');
        if (action) action.value = following ? 'unfollow' : 'follow';
    }
}

async function send(id: string, follow: boolean): Promise<boolean> {
    try {
        const res = await fetch('/api/lists/sagas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collectionId: Number(id), action: follow ? 'follow' : 'unfollow' }),
        });
        const data = await res.json().catch(() => ({}));
        return res.ok && !!data?.ok;
    } catch {
        return false;
    }
}

async function toggle(form: HTMLFormElement, follow: boolean): Promise<void> {
    const id = form.querySelector<HTMLInputElement>('input[name="collection_id"]')?.value || '';
    const name = form.dataset.name || 'la saga';
    const btn = form.querySelector<HTMLButtonElement>('button');
    if (!id || btn?.classList.contains('is-submitting')) return;
    btn?.classList.add('is-submitting');
    setState(id, follow); // optimista
    const ok = await send(id, follow);
    btn?.classList.remove('is-submitting');
    if (!ok) {
        setState(id, !follow);
        showToast('No se ha podido guardar. Inténtalo otra vez.', 'error');
        return;
    }
    showToast(follow ? `Sigues ${name}: te avisaremos de lo que llegue` : `Ya no sigues ${name}`, 'success', () => void toggle(form, !follow));
}

document.addEventListener('submit', (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>(FORM);
    if (!form) return;
    e.preventDefault();
    const action = form.querySelector<HTMLInputElement>('input[name="op"]')?.value;
    void toggle(form, action === 'follow');
});
