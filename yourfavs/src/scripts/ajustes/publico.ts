/**
 * Ajustes → «Perfil público»: lo que no es un campo simple del autoguardado (handoff §8).
 *
 *   · Dirección: minúsculas al teclear, reglas en vivo, comprobación con el servidor
 *     (`GET /api/profile/handle`, 350 ms) y guardado al salir del campo, con confirmación si
 *     cambia una que ya existía (rompe los enlaces y no se puede repetir en 30 días).
 *   · Visibilidad: no deja pasar a «Público» sin dirección guardada (el guardado en sí lo hace
 *     autosave.ts) y mantiene a la vista «Ver mi perfil» / «Compartir».
 *   · Mis 4: diálogo buscador, flechas para ordenar y «Quitar».
 *   · Colecciones públicas y títulos ocultos.
 *
 * Indicador y Deshacer son los de autosave.ts, vía `yf:save-state` y `yf:undo`.
 */
export {};

const root = document.getElementById('aj-public');
if (root) init(root);

type State = 'saving' | 'saved' | 'error';
interface Pick { media_type: 'movie' | 'tv'; tmdb_id: number; title: string; poster_path: string | null; year: string | null }
interface SearchItem { id: number; media_type: 'movie' | 'tv' | 'person'; title: string; subtitle: string; poster_path: string | null }

function saveState(state: State, msg: string) {
    document.dispatchEvent(new CustomEvent('yf:save-state', { detail: { state, msg } }));
}
function offerUndo(label: string, revert: () => void) {
    document.dispatchEvent(new CustomEvent('yf:undo', { detail: { label, revert } }));
}
async function api(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    try {
        const res = await fetch(url, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok && data.ok !== false, status: res.status, data };
    } catch {
        return { ok: false, status: 0, data: {} };
    }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
const posterSrc = (p: string | null, size = 'w185') => (p ? `https://image.tmdb.org/t/p/${size}${p}` : '');
const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    spin: '<svg class="aj-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
};

function init(root: HTMLElement) {
    const boot = JSON.parse(document.getElementById('aj-public-boot')?.textContent || '{}') as {
        handle: string | null; cooldownUntil: string | null; nextChangeLabel: string; four: Pick[]; visibility: string;
    };
    let savedHandle = boot.handle;
    let four: Pick[] = Array.isArray(boot.four) ? boot.four.slice(0, 4) : [];
    const touch = window.matchMedia('(hover: none)').matches;

    // =====================================================================================
    // Dirección
    // =====================================================================================
    const hInput = document.getElementById('pp-handle') as HTMLInputElement | null;
    const hBox = document.getElementById('pp-handle-box');
    const hState = document.getElementById('pp-handle-state');
    const hCount = document.getElementById('pp-handle-count');
    const hError = document.getElementById('pp-handle-error');
    const hHelp = document.getElementById('pp-handle-help');
    const ruleLen = root.querySelector<HTMLElement>('[data-rule="len"]');
    const ruleChars = root.querySelector<HTMLElement>('[data-rule="chars"]');
    let checkTimer = 0;
    let checkSeq = 0;
    let lastCheck: { value: string; ok: boolean } | null = null;

    function setRule(li: HTMLElement | null, ok: boolean | null) {
        li?.classList.toggle('is-ok', ok === true);
        li?.classList.toggle('is-bad', ok === false);
    }
    function setHandleState(kind: 'none' | 'checking' | 'ok' | 'taken', bad = false) {
        if (!hState || !hBox) return;
        hState.className = 'aj-handle-state';
        hState.innerHTML = '';
        if (kind === 'checking') hState.innerHTML = `${ICON.spin}Comprobando…`;
        if (kind === 'ok') { hState.classList.add('is-ok'); hState.innerHTML = `${ICON.check}Disponible`; }
        if (kind === 'taken') { hState.classList.add('is-bad'); hState.innerHTML = `${ICON.x}Ocupado`; }
        hBox.classList.toggle('is-bad', bad || kind === 'taken');
    }
    function showError(msg: string | null) {
        if (!hError) return;
        hError.textContent = msg ?? '';
        hError.hidden = !msg;
    }
    function shapeOk(v: string) {
        const len = v.length >= 3 && v.length <= 20;
        const chars = /^[a-z0-9_]*$/.test(v) && v.length > 0;
        return { len, chars, ok: len && chars };
    }

    async function check(value: string) {
        const seq = ++checkSeq;
        setHandleState('checking');
        const res = await api(`/api/profile/handle?h=${encodeURIComponent(value)}`, 'GET');
        if (seq !== checkSeq) return;   // llegó tarde: ya se escribió otra cosa
        if (res.data?.ok) {
            lastCheck = { value, ok: true };
            setHandleState(res.data.same ? 'none' : 'ok');
            showError(null);
        } else {
            lastCheck = { value, ok: false };
            const reason = res.data?.reason;
            if (reason === 'taken' || reason === 'reserved') { setHandleState('taken'); showError(null); }
            else if (reason === 'cooldown') { setHandleState('none', true); showError('Solo puedes cambiar tu dirección una vez cada 30 días.'); }
            else setHandleState('none', true);
        }
    }

    hInput?.addEventListener('input', () => {
        // Al escribir: minúsculas y sin espacios (handoff §8.1).
        const cleaned = hInput.value.toLowerCase().replace(/\s+/g, '');
        if (cleaned !== hInput.value) {
            const pos = hInput.selectionStart ?? cleaned.length;
            hInput.value = cleaned;
            hInput.setSelectionRange(Math.min(pos, cleaned.length), Math.min(pos, cleaned.length));
        }
        const v = hInput.value;
        if (hCount) hCount.textContent = `${v.length}/20`;
        const s = shapeOk(v);
        setRule(ruleLen, v ? s.len : null);
        setRule(ruleChars, v ? s.chars : null);
        lastCheck = null;
        showError(null);
        window.clearTimeout(checkTimer);
        if (!v || v === savedHandle) { setHandleState('none'); return; }
        if (!s.ok) { setHandleState('none', true); return; }
        checkTimer = window.setTimeout(() => check(v), 350);
    });

    // Se guarda AL SALIR del campo, si está disponible.
    hInput?.addEventListener('change', async () => {
        const v = hInput.value;
        if (!v || v === savedHandle || !shapeOk(v).ok) return;
        window.clearTimeout(checkTimer);
        if (!lastCheck || lastCheck.value !== v) await check(v);
        if (!lastCheck?.ok) return;
        if (savedHandle) {
            const sure = window.confirm(
                `¿Cambiar tu dirección?\n\nLos enlaces a yourfavs.app/u/${savedHandle} dejarán de funcionar. ` +
                `No podrás volver a cambiarla hasta el ${boot.nextChangeLabel}.`,
            );
            if (!sure) {
                hInput.value = savedHandle;
                hInput.dispatchEvent(new Event('input'));
                return;
            }
        }
        saveState('saving', 'Guardando…');
        const hadHandle = Boolean(savedHandle);
        const res = await api('/api/profile/public', 'PATCH', { handle: v });
        if (!res.ok) {
            saveState('error', 'No se pudo guardar');
            if (res.status === 409) setHandleState('taken');
            showError(res.data?.error || 'No se pudo guardar la dirección.');
            return;
        }
        savedHandle = res.data.settings.handle;
        saveState('saved', 'Guardado');
        setHandleState('none');
        showError(null);
        updateLinks();
        if (hadHandle && hHelp) {
            // Recién cambiada: entra en los 30 días.
            hInput.readOnly = true;
            hHelp.textContent = `Podrás cambiarla a partir del ${boot.nextChangeLabel}.`;
        } else if (hHelp) {
            hHelp.textContent = 'Se guarda al salir del campo.';
        }
    });
    if (hInput) hInput.dispatchEvent(new Event('input'));

    // =====================================================================================
    // Visibilidad y enlaces
    // =====================================================================================
    const links = document.getElementById('pp-public-links');
    const visHelp = document.getElementById('pp-vis-help');
    const urlInput = document.getElementById('pp-url') as HTMLInputElement | null;
    const openLink = document.getElementById('pp-open') as HTMLAnchorElement | null;

    function currentVisibility(): string {
        return root.querySelector<HTMLInputElement>('input[name="visibility"]:checked')?.value ?? 'off';
    }
    function updateLinks() {
        const vis = currentVisibility();
        if (links) links.hidden = vis === 'off' || !savedHandle;
        if (visHelp) visHelp.textContent = (vis === 'off' ? visHelp.dataset.helpOff : visHelp.dataset.helpPublic) || '';
        if (savedHandle) {
            if (urlInput) urlInput.value = `https://yourfavs.app/u/${savedHandle}`;
            if (openLink) openLink.href = `/u/${savedHandle}`;
        }
        // El valor de la navegación de Ajustes («Público» / «Desactivado»), sin recargar.
        document.querySelectorAll<HTMLElement>('a[href="/perfil/publico"] .aj-nav-value, a[href="/perfil/publico"] .aj-index-row-value')
            .forEach((el) => { el.textContent = vis === 'public' ? 'Público' : 'Desactivado'; });
    }

    // Antes que autosave (captura): sin dirección guardada no se puede publicar.
    document.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        if (t?.name !== 'visibility' || !root.contains(t)) return;
        if (t.value !== 'off' && !savedHandle) {
            e.stopImmediatePropagation();
            const off = root.querySelector<HTMLInputElement>('input[name="visibility"][value="off"]');
            if (off) off.checked = true;
            showError('Elige primero tu dirección.');
            hInput?.focus();
        }
    }, true);
    document.addEventListener('yf:saved', (e) => {
        const d = (e as CustomEvent).detail as { field: string };
        if (d.field === 'visibility') updateLinks();
    });

    // Compartir: hoja nativa en móvil, copiar en escritorio.
    const shareBtn = document.getElementById('pp-share');
    const shareLabel = document.getElementById('pp-share-label');
    if (touch && typeof navigator.share === 'function' && shareLabel) shareLabel.textContent = 'Compartir';
    shareBtn?.addEventListener('click', async () => {
        const url = urlInput?.value || '';
        if (!url) return;
        if (touch && typeof navigator.share === 'function') {
            try { await navigator.share({ title: 'Mi perfil en YourFavs', url }); } catch { /* cancelado */ }
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            if (shareLabel) { shareLabel.textContent = '¡Copiado!'; window.setTimeout(() => { shareLabel.textContent = 'Copiar enlace'; }, 1800); }
        } catch {
            urlInput?.select();
        }
    });

    // =====================================================================================
    // Bio: contador (el guardado lo hace autosave)
    // =====================================================================================
    const bio = document.getElementById('pp-bio') as HTMLTextAreaElement | null;
    const bioCount = document.getElementById('pp-bio-count');
    bio?.addEventListener('input', () => {
        const n = [...bio.value].length;
        if (bioCount) {
            bioCount.textContent = `${n}/280`;
            bioCount.classList.toggle('is-near', n >= 260);
        }
    });

    // =====================================================================================
    // Mis 4
    // =====================================================================================
    const fourBox = document.getElementById('pp-four');

    function renderFour(focus?: { slot: number; what: 'pick' | 'left' | 'right' }) {
        if (!fourBox) return;
        fourBox.innerHTML = [0, 1, 2, 3].map((i) => {
            const p = four[i];
            const po = p
                ? `<div class="aj-four-po">${p.poster_path ? `<img src="${posterSrc(p.poster_path)}" alt="" loading="lazy" />` : ''}</div>`
                : `<div class="aj-four-po is-empty">${ICON.plus}</div>`;
            const ctl = p
                ? `<button type="button" class="aj-btn is-ico" data-four-move="-1" aria-label="Mover a la izquierda"${i === 0 ? ' disabled' : ''}>${ICON.left}</button>
                   <button type="button" class="aj-btn" data-four-pick>Cambiar</button>
                   <button type="button" class="aj-btn is-ico" data-four-move="1" aria-label="Mover a la derecha"${i === four.length - 1 ? ' disabled' : ''}>${ICON.right}</button>`
                : `<button type="button" class="aj-btn" data-four-pick>Elegir</button>`;
            return `<div class="aj-four-cell" data-slot="${i}">
                <span class="aj-four-pos">${i + 1}</span>${po}
                <div class="aj-four-t" title="${p ? esc(p.title) : ''}">${p ? esc(p.title) : `Hueco ${i + 1}`}</div>
                <div class="aj-four-ctl">${ctl}</div></div>`;
        }).join('');
        if (focus) {
            const cell = fourBox.querySelector<HTMLElement>(`[data-slot="${focus.slot}"]`);
            const sel = focus.what === 'pick' ? '[data-four-pick]' : `[data-four-move="${focus.what === 'left' ? -1 : 1}"]`;
            (cell?.querySelector<HTMLButtonElement>(`${sel}:not([disabled])`) ?? cell?.querySelector<HTMLButtonElement>('[data-four-pick]'))?.focus();
        }
    }

    async function saveFour(next: Pick[], focus?: { slot: number; what: 'pick' | 'left' | 'right' }): Promise<boolean> {
        const prev = four;
        four = next;
        renderFour(focus);
        saveState('saving', 'Guardando…');
        const res = await api('/api/profile/public', 'PATCH', { four: next });
        if (!res.ok) {
            four = prev;
            renderFour(focus);
            saveState('error', res.data?.error || 'No se pudo guardar');
            return false;
        }
        four = res.data.settings.four;
        renderFour(focus);
        saveState('saved', 'Guardado');
        return true;
    }

    fourBox?.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest<HTMLButtonElement>('button');
        const cell = btn?.closest<HTMLElement>('[data-slot]');
        if (!btn || !cell) return;
        const slot = Number(cell.dataset.slot);
        if (btn.hasAttribute('data-four-pick')) { openPicker(Math.min(slot, four.length)); return; }
        const dir = Number(btn.dataset.fourMove);
        const to = slot + dir;
        if (!dir || to < 0 || to >= four.length) return;
        const next = four.slice();
        [next[slot], next[to]] = [next[to], next[slot]];
        saveFour(next, { slot: to, what: dir < 0 ? 'left' : 'right' });
    });

    // ---- Diálogo buscador ---------------------------------------------------------------
    const picker = document.getElementById('pp-picker');
    const pTitle = document.getElementById('pp-picker-title');
    const pInput = document.getElementById('pp-picker-q') as HTMLInputElement | null;
    const pList = document.getElementById('pp-picker-list');
    const pFoot = document.getElementById('pp-picker-foot');
    const pRemove = document.getElementById('pp-picker-remove');
    const pClose = document.getElementById('pp-picker-close');
    let pSlot = 0;
    let pTab: 'all' | 'movie' | 'tv' | 'mine' = 'all';
    let pResults: SearchItem[] = [];
    let pActive = -1;
    let pTimer = 0;
    let pSeq = 0;
    let lastFocus: HTMLElement | null = null;

    function openPicker(slot: number) {
        if (!picker) return;
        pSlot = slot;
        const cur = four[slot];
        if (pTitle) pTitle.textContent = cur ? `Hueco ${slot + 1} · cambiar «${cur.title}»` : `Hueco ${slot + 1} · elegir`;
        if (pFoot) pFoot.hidden = !cur;
        lastFocus = document.activeElement as HTMLElement;
        picker.hidden = false;
        document.body.style.overflow = 'hidden';
        if (pInput) { pInput.value = ''; pInput.focus(); }
        pResults = [];
        renderResults('Escribe para buscar.');
    }
    function closePicker() {
        if (!picker) return;
        picker.hidden = true;
        document.body.style.overflow = '';
        lastFocus?.focus?.();
    }
    function inFour(it: { media_type: string; id: number }) {
        return four.findIndex((p) => p.media_type === it.media_type && p.tmdb_id === it.id);
    }
    function renderResults(empty?: string) {
        if (!pList) return;
        if (!pResults.length) {
            pList.innerHTML = `<p class="aj-picker-state">${esc(empty || 'Nada coincide.')}</p>`;
            return;
        }
        pList.innerHTML = pResults.map((it, i) => {
            const at = inFour(it);
            const taken = at !== -1 && at !== pSlot;
            const type = it.media_type === 'movie' ? 'Película' : 'Serie';
            const year = /^\d{4}/.test(it.subtitle) ? it.subtitle.slice(0, 4) : '';
            return `<button type="button" role="option" class="aj-picker-item${i === pActive ? ' is-active' : ''}" data-i="${i}"${taken ? ' disabled aria-disabled="true"' : ''} aria-selected="${i === pActive}">
                <span class="aj-picker-po">${it.poster_path ? `<img src="${posterSrc(it.poster_path, 'w92')}" alt="" loading="lazy" />` : ''}</span>
                <span class="aj-picker-name">${esc(it.title)}<span class="aj-picker-meta">${type}${year ? ` · ${year}` : ''}</span></span>
                ${taken ? `<span class="aj-picker-tag">Ya está en tus 4 · hueco ${at + 1}</span>` : ''}
            </button>`;
        }).join('');
    }
    async function search() {
        const q = pInput?.value.trim() ?? '';
        const seq = ++pSeq;
        if (q.length < 2) { pResults = []; renderResults('Escribe para buscar.'); return; }
        if (pList) pList.innerHTML = '<p class="aj-picker-state">Buscando…</p>';
        const url = pTab === 'mine' ? `/api/search/personal?q=${encodeURIComponent(q)}` : `/api/search/multi?q=${encodeURIComponent(q)}`;
        const res = await api(url, 'GET');
        if (seq !== pSeq) return;
        const items: SearchItem[] = Array.isArray(res.data?.items) ? res.data.items : [];
        pResults = items.filter((it) => (it.media_type === 'movie' || it.media_type === 'tv') && (pTab === 'all' || pTab === 'mine' || it.media_type === pTab));
        pActive = pResults.length ? 0 : -1;
        renderResults(res.ok ? 'Nada coincide.' : 'No se pudo buscar.');
    }
    async function choose(i: number) {
        const it = pResults[i];
        if (!it) return;
        const at = inFour(it);
        if (at !== -1 && at !== pSlot) return;
        const year = /^\d{4}/.test(it.subtitle) ? it.subtitle.slice(0, 4) : null;
        const pick: Pick = { media_type: it.media_type as 'movie' | 'tv', tmdb_id: it.id, title: it.title, poster_path: it.poster_path, year };
        const next = four.slice();
        if (pSlot < next.length) next[pSlot] = pick; else next.push(pick);
        closePicker();
        await saveFour(next, { slot: Math.min(pSlot, next.length - 1), what: 'pick' });
    }

    pInput?.addEventListener('input', () => { window.clearTimeout(pTimer); pTimer = window.setTimeout(search, 300); });
    pInput?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!pResults.length) return;
            pActive = (pActive + (e.key === 'ArrowDown' ? 1 : -1) + pResults.length) % pResults.length;
            renderResults();
            pList?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (pActive >= 0) choose(pActive);
        }
    });
    pList?.addEventListener('click', (e) => {
        const b = (e.target as Element).closest<HTMLButtonElement>('.aj-picker-item');
        if (b && !b.disabled) choose(Number(b.dataset.i));
    });
    picker?.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
        b.addEventListener('click', () => {
            pTab = b.dataset.tab as typeof pTab;
            picker.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
            search();
            pInput?.focus();
        });
    });
    pRemove?.addEventListener('click', async () => {
        const removed = four[pSlot];
        const slot = pSlot;
        closePicker();
        const next = four.filter((_, i) => i !== slot);
        if (await saveFour(next, { slot: Math.min(slot, 3), what: 'pick' }) && removed) {
            offerUndo(`Quitaste «${removed.title}» de tus 4`, () => {
                const back = four.slice();
                back.splice(Math.min(slot, back.length), 0, removed);
                saveFour(back.slice(0, 4), { slot, what: 'pick' });
            });
        }
    });
    pClose?.addEventListener('click', closePicker);
    picker?.addEventListener('mousedown', (e) => { if (e.target === picker) closePicker(); });
    picker?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePicker(); } });

    // =====================================================================================
    // Colecciones públicas
    // =====================================================================================
    async function setCollection(input: HTMLInputElement, isPublic: boolean, withUndo: boolean) {
        const id = input.dataset.collId!;
        const name = input.dataset.collName || 'la colección';
        const desc = input.closest('.aj-row')?.querySelector<HTMLElement>('[data-coll-desc]');
        input.checked = isPublic;
        saveState('saving', 'Guardando…');
        const res = await api(`/api/profile/collections/${encodeURIComponent(id)}/public`, 'PATCH', { isPublic });
        if (!res.ok) {
            input.checked = !isPublic;
            saveState('error', 'No se pudo guardar');
            return;
        }
        if (desc) desc.textContent = `${desc.dataset.count}${isPublic ? '' : ' · privada'}`;
        saveState('saved', 'Guardado');
        if (withUndo && !isPublic) offerUndo(`«${name}» ya no sale en tu perfil`, () => setCollection(input, true, false));
    }
    root.querySelectorAll<HTMLInputElement>('input[data-coll-id]').forEach((input) => {
        input.addEventListener('change', () => setCollection(input, input.checked, true));
    });

    // =====================================================================================
    // Títulos ocultos
    // =====================================================================================
    const hiddenList = document.getElementById('pp-hidden-list');
    const hiddenNone = document.getElementById('pp-hidden-none');
    hiddenList?.addEventListener('click', async (e) => {
        const btn = (e.target as Element).closest<HTMLButtonElement>('[data-unhide]');
        const row = btn?.closest<HTMLElement>('.aj-row');
        if (!btn || !row) return;
        const ref = { mediaType: btn.dataset.mt, tmdbId: Number(btn.dataset.id) };
        const title = btn.dataset.title || 'el título';
        btn.disabled = true;
        saveState('saving', 'Guardando…');
        const res = await api('/api/profile/hidden', 'DELETE', ref);
        btn.disabled = false;
        if (!res.ok) { saveState('error', 'No se pudo guardar'); return; }
        const next = row.nextSibling;
        row.remove();
        if (hiddenNone) hiddenNone.hidden = hiddenList.children.length > 0;
        saveState('saved', 'Guardado');
        offerUndo(`Volviste a mostrar «${title}»`, async () => {
            const back = await api('/api/profile/hidden', 'POST', { ...ref, title: btn.dataset.title, posterPath: btn.dataset.poster || null });
            if (!back.ok) { saveState('error', 'No se pudo deshacer'); return; }
            hiddenList.insertBefore(row, next && next.parentNode === hiddenList ? next : null);
            if (hiddenNone) hiddenNone.hidden = true;
        });
    });

    updateLinks();
}
