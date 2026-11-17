/**
 * Autoguardado del panel de Ajustes — handoff `design_handoff_ajustes`.
 *
 * Sustituye al POST con recarga: cada control guarda SOLO su campo contra
 * `PATCH /api/profile/preferences` (o `/home-layout` para el orden de la portada), con el
 * indicador `Guardando… → Guardado` en la cabecera y vuelta atrás del control si falla.
 *
 * Cómo se declara un control en el markup:
 *   data-save="region"                  → campo escalar (input/select/checkbox)
 *   data-save-debounce="600"            → espera antes de mandar (texto); por defecto, 0
 *   data-save-group="platforms"          → contenedor de checkboxes → array de números
 *   data-save-group="notifPrefs" + data-notif="episodes" en cada checkbox → objeto
 *   id="home-layout"                     → lista de la Home (orden + visibilidad)
 *   data-save-url="/api/profile/public"  → en el campo o en su grupo: a qué endpoint va (por
 *                                          defecto, /api/profile/preferences)
 *   data-save-order                      → en un grupo con `data-key`: se manda como LISTA
 *                                          `[{id, on}]` en el orden de las filas (secciones del
 *                                          perfil, que se reordenan arrastrando; F6)
 *
 * Eventos para otros scripts de la página (Ajustes → «Perfil público»):
 *   `yf:save-state` { state, msg }  → usa este mismo indicador «Guardando… / Guardado»
 *   `yf:undo` { label, revert }      → usa esta misma barra de Deshacer
 *   `yf:saved` { field, value }      → avisa de cada guardado confirmado por el servidor
 *   `yf:reorder` { field }           → otro script ha cambiado el orden de un grupo: guárdalo
 *
 * Cola: UNA petición en vuelo por campo. Un cambio nuevo sobre el mismo campo aborta la
 * anterior (si no, dos toques rápidos podían aplicarse en orden inverso y dejar guardado el
 * valor viejo); campos distintos viajan en paralelo.
 *
 * El `<form>` sigue existiendo y el POST del servidor sigue funcionando: sin JS esto no
 * corre, los botones "Guardar cambios" no se esconden y el guardado va por recarga.
 */
// Sin ningún import/export, TypeScript trata el fichero como script GLOBAL y sus funciones
// chocan con las de otros scripts (aquí, el `init` de home-reorder.ts). Esto lo hace módulo.
export {};

const PREFS_URL = '/api/profile/preferences';
const HOME_URL = '/api/profile/home-layout';
const HOME_FIELD = '__home__';   // clave interna en la cola (no es un campo del perfil)

const rootEl = document.querySelector<HTMLElement>('[data-autosave]');
if (rootEl) init(rootEl);

// En una función (y no dentro de un `if`) porque TypeScript no conserva el estrechamiento de
// `root` dentro de los closures anidados; así el tipo llega no-nulo a todos los helpers.
function init(root: HTMLElement) {
    // --- Indicador de la cabecera -------------------------------------------
    const ind = document.getElementById('aj-saved');
    const indMsg = ind?.querySelector<HTMLElement>('.aj-saved-msg');
    const indRetry = ind?.querySelector<HTMLButtonElement>('.aj-saved-retry');
    let hideTimer = 0;

    type State = 'saving' | 'saved' | 'error';
    function setState(state: State, msg: string) {
        if (!ind || !indMsg) return;
        window.clearTimeout(hideTimer);
        ind.dataset.state = state;
        ind.hidden = false;
        indMsg.textContent = msg;
        if (indRetry) indRetry.hidden = state !== 'error';
        // "Guardado" se desvanece a los 3s; "Guardando" y el error se quedan.
        if (state === 'saved') hideTimer = window.setTimeout(() => { ind.hidden = true; }, 3000);
    }

    // --- Estado -------------------------------------------------------------
    const inflight = new Map<string, AbortController>();
    const timers = new Map<string, number>();
    /** Último valor CONFIRMADO por el servidor, para poder revertir. */
    const committed = new Map<string, unknown>();
    /** Qué reintentar si el usuario pulsa "Reintentar". */
    let lastFailed: string | null = null;

    const els = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

    /** Grupo de interruptores como `{ clave: encendido }`, venga como objeto o como lista ordenada. */
    function asOnMap(value: unknown): Record<string, boolean> {
        if (Array.isArray(value)) {
            return Object.fromEntries(value.map((x) => [String((x as { id?: unknown }).id), (x as { on?: unknown }).on === true]));
        }
        return (value && typeof value === 'object' ? value : {}) as Record<string, boolean>;
    }

    function groupBox(field: string) {
        return root.querySelector<HTMLElement>(`[data-save-group="${field}"]`);
    }
    function scalarEl(field: string) {
        return root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-save="${field}"]`);
    }
    /** Endpoint del campo: el que declare su elemento o su grupo, o el de preferencias. */
    function urlFor(field: string): string {
        const el = groupBox(field) ?? scalarEl(field);
        return el?.dataset.saveUrl || PREFS_URL;
    }

    /** Lee el valor actual del DOM para ese campo. */
    function readField(field: string): unknown {
        const box = groupBox(field);
        if (box) {
            const inputs = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
            // Dos formas de grupo, distinguidas por el markup y no por el nombre del campo:
            //  · con `data-key` en las casillas → OBJETO de booleanos (notifPrefs, spoilers)
            //  · sin él                        → ARRAY de números (platforms)
            if (inputs.some((i) => i.dataset.key)) {
                // Con orden: la lista de filas tal cual está en pantalla.
                if (box.hasAttribute('data-save-order')) {
                    return inputs.filter((i) => i.dataset.key).map((i) => ({ id: i.dataset.key!, on: i.checked }));
                }
                const out: Record<string, boolean> = {};
                for (const i of inputs) {
                    if (i.dataset.key) out[i.dataset.key] = i.checked;
                }
                return out;
            }
            return inputs.filter((i) => i.checked).map((i) => Number(i.value));
        }
        const el = scalarEl(field);
        if (!el) return undefined;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
        // Grupo de radios: varios elementos comparten el mismo `data-save`, así que el valor
        // es el del MARCADO, no el del primero que aparezca en el DOM.
        if (el instanceof HTMLInputElement && el.type === 'radio') {
            return root.querySelector<HTMLInputElement>(`[data-save="${field}"]:checked`)?.value ?? '';
        }
        return el.value;
    }

    /** Devuelve el DOM al valor dado (para revertir un fallo). */
    function writeField(field: string, value: unknown) {
        const box = groupBox(field);
        if (box) {
            const inputs = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
            if (inputs.some((i) => i.dataset.key)) {
                // Revertir devuelve los interruptores, no el orden (como la Home).
                const map = asOnMap(value);
                for (const i of inputs) {
                    const k = i.dataset.key;
                    if (k && k in map) i.checked = map[k];
                }
                return;
            }
            const on = new Set((Array.isArray(value) ? value : []).map(Number));
            for (const i of inputs) i.checked = on.has(Number(i.value));
            return;
        }
        const el = scalarEl(field);
        if (!el) return;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') { el.checked = value === true; return; }
        if (el instanceof HTMLInputElement && el.type === 'radio') {
            root.querySelectorAll<HTMLInputElement>(`[data-save="${field}"]`)
                .forEach((r) => { r.checked = r.value === String(value ?? ''); });
            return;
        }
        el.value = String(value ?? '');
    }

    // --- Barra de Deshacer --------------------------------------------------
    // Solo para acciones con consecuencia VISIBLE: ocultar un bloque de la portada y quitar
    // una plataforma. Vive aquí y no en su propio script para compartir la cola: deshacer es
    // un guardado más, con su mismo abort por campo.
    //
    // Dos acciones de la lista del handoff no la llevan, y por razones distintas:
    //  · quitar el avatar → hoy hace POST + recarga; entra en A6, que lo pasa a PATCH.
    //  · reiniciar gustos → es IRREVERSIBLE. Se borra `taste/current` y no hay copia, así que
    //    una barra de "Deshacer" ahí sería mentira. De ahí su `confirm()` y su sitio bajo
    //    «Opciones avanzadas».
    const undoBar = document.getElementById('aj-undo');
    const undoMsg = document.getElementById('aj-undo-msg');
    const undoBtn = document.getElementById('aj-undo-do');
    const undoClose = document.getElementById('aj-undo-close');
    const UNDO_MS = 6000;
    let undoTimer = 0;
    let undoAction: (() => void) | null = null;
    /** Se ejecuta si la barra caduca o se cierra SIN deshacer (p. ej. recargar para que el
     *  servidor vuelva a resolver algo que el cliente no sabe pintar). */
    let undoExpire: (() => void) | null = null;

    function hideUndo(ranUndo = false) {
        window.clearTimeout(undoTimer);
        const onExpire = undoExpire;
        undoAction = null;
        undoExpire = null;
        if (undoBar) undoBar.hidden = true;
        if (!ranUndo) onExpire?.();
    }

    /** Una acción nueva REEMPLAZA la barra anterior; nunca se apilan. */
    function offerUndo(label: string, revert: () => void, onExpire?: () => void) {
        if (!undoBar || !undoMsg) return;
        window.clearTimeout(undoTimer);
        undoMsg.textContent = label;
        undoAction = revert;
        undoExpire = onExpire ?? null;
        undoBar.hidden = false;
        undoTimer = window.setTimeout(() => hideUndo(), UNDO_MS);
    }

    /**
     * Puerta de entrada para el resto de la página (el diálogo de avatar). Así el Deshacer
     * tiene UN solo dueño en vez de dos barras compitiendo por el mismo hueco.
     */
    /** Otros scripts de la página guardan por su cuenta pero comparten el indicador. */
    document.addEventListener('yf:save-state', (e) => {
        const d = (e as CustomEvent).detail as { state?: State; msg?: string };
        if (d?.state && d.msg) setState(d.state, d.msg);
    });

    document.addEventListener('yf:undo', (e) => {
        const d = (e as CustomEvent).detail as { label?: string; revert?: () => void; onExpire?: () => void };
        if (d?.label && typeof d.revert === 'function') offerUndo(d.label, d.revert, d.onExpire);
    });

    undoBtn?.addEventListener('click', () => {
        const revert = undoAction;
        hideUndo(true);   // se deshace: no hay que ejecutar el `onExpire`
        revert?.();
    });
    undoClose?.addEventListener('click', () => hideUndo());

    /** Marca una casilla y avisa: el propio `change` dispara el guardado y la recolocación. */
    function recheck(input: HTMLInputElement | null) {
        if (!input) return;
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * ¿Este guardado merece una barra de Deshacer? Se decide comparando el valor confirmado
     * con el nuevo, para no tener que declarar la intención en cada sitio del markup.
     * Solo cuando se QUITA algo, y solo de uno en uno (si borras tres cosas de golpe, un
     * "deshacer" sin decir cuál engaña más de lo que ayuda).
     */
    function undoFor(field: string, prev: unknown, next: unknown): { label: string; revert: () => void } | null {
        if (field === 'platforms') {
            if (!Array.isArray(prev) || !Array.isArray(next)) return null;
            const gone = (prev as number[]).filter((id) => !(next as number[]).includes(id));
            if (gone.length !== 1) return null;
            const input = root.querySelector<HTMLInputElement>(`input[name="platforms"][value="${gone[0]}"]`);
            const name = input?.closest('.aj-tile')?.querySelector('.aj-tile-name')?.textContent?.trim();
            return { label: `Quitaste ${name || 'la plataforma'}`, revert: () => recheck(input) };
        }

        // Perfil público: apagar una sección y desactivar el perfil (handoff §8.1 y §8.4).
        if (field === 'sections') {
            if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return null;
            const p = asOnMap(prev);
            const n = asOnMap(next);
            const off = Object.keys(n).filter((k) => p[k] === true && n[k] === false);
            if (off.length !== 1) return null;
            const input = root.querySelector<HTMLInputElement>(`[data-save-group="sections"] input[data-key="${off[0]}"]`);
            const title = input?.closest('.aj-row')?.querySelector('.aj-row-title')?.firstChild?.textContent?.trim();
            return { label: `Quitaste «${title || 'la sección'}» de tu perfil`, revert: () => recheck(input) };
        }
        if (field === 'visibility') {
            if (prev === 'off' || next !== 'off') return null;
            const radio = root.querySelector<HTMLInputElement>(`[data-save="visibility"][value="${String(prev)}"]`);
            return { label: 'Desactivaste tu perfil público', revert: () => recheck(radio) };
        }

        if (field === HOME_FIELD) {
            type Row = { key: string; hidden: boolean };
            if (!Array.isArray(prev) || !Array.isArray(next)) return null;
            const wasVisible = new Set((prev as Row[]).filter((r) => !r.hidden).map((r) => r.key));
            const justHidden = (next as Row[]).filter((r) => r.hidden && wasVisible.has(r.key));
            if (justHidden.length !== 1) return null;
            const key = justHidden[0].key;
            const row = document.querySelector<HTMLElement>(`.aj-home-row[data-key="${key}"]`);
            const title = row?.querySelector('.aj-home-title')?.textContent?.trim();
            return {
                label: `Ocultaste «${title || 'el bloque'}»`,
                revert: () => recheck(row?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null),
            };
        }

        return null;
    }

    // --- Envío --------------------------------------------------------------

    /** Estado de la lista de la Home leído del DOM: el ORDEN es el de las filas. */
    function readHome(): { key: string; hidden: boolean }[] {
        const box = document.getElementById('home-layout');
        if (!box) return [];
        return Array.from(box.querySelectorAll<HTMLElement>('[data-key]')).map((row) => ({
            key: row.dataset.key || '',
            hidden: !row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
        }));
    }

    async function send(field: string) {
        const isHome = field === HOME_FIELD;
        const value = isHome ? readHome() : readField(field);
        if (!isHome && value === undefined) return;

        // Un cambio nuevo invalida el anterior del MISMO campo.
        inflight.get(field)?.abort();
        const ac = new AbortController();
        inflight.set(field, ac);

        setState('saving', 'Guardando…');
        try {
            const res = await fetch(isHome ? HOME_URL : urlFor(field), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isHome ? { layout: value } : { [field]: value }),
                signal: ac.signal,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar');

            // El Deshacer se ofrece con el valor CONFIRMADO anterior (no con el que hubiera en
            // pantalla), y solo tras un guardado con éxito: si falló, el control ya ha vuelto
            // solo a su sitio y no hay nada que deshacer.
            const undo = undoFor(field, committed.get(field), value);
            committed.set(field, value);
            lastFailed = null;
            setState('saved', 'Guardado');
            if (undo) offerUndo(undo.label, undo.revert);
            document.dispatchEvent(new CustomEvent('yf:saved', { detail: { field, value } }));
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;   // lo reemplazó otro cambio
            // La Home no se revierte: el orden es un array entero y devolver las filas a su
            // sitio a mitad de una reordenación desconcierta más que ayuda. Queda el aviso
            // de error con "Reintentar", que reenvía el orden que está en pantalla.
            if (!isHome) writeField(field, committed.get(field));
            lastFailed = field;
            setState('error', 'No se pudo guardar');
        } finally {
            if (inflight.get(field) === ac) inflight.delete(field);
        }
    }

    function queue(field: string, delay: number) {
        window.clearTimeout(timers.get(field));
        if (delay > 0) {
            timers.set(field, window.setTimeout(() => send(field), delay));
        } else {
            send(field);
        }
    }

    // --- Cableado -----------------------------------------------------------

    // Valor de partida = lo que el servidor acaba de renderizar.
    const fields = new Set<string>();
    els('[data-save]').forEach((el) => fields.add(el.dataset.save!));
    els('[data-save-group]').forEach((el) => fields.add(el.dataset.saveGroup!));
    fields.forEach((f) => committed.set(f, readField(f)));
    // La Home no se declara con `data-save*`, así que hay que sembrarla a mano: sin esto, el
    // PRIMER bloque que ocultases no tendría barra de Deshacer (no habría valor anterior con
    // el que comparar).
    if (document.getElementById('home-layout')) committed.set(HOME_FIELD, readHome());

    function fieldOf(target: HTMLElement): { field: string; delay: number } | null {
        const scalar = target.closest<HTMLElement>('[data-save]');
        if (scalar) return { field: scalar.dataset.save!, delay: Number(scalar.dataset.saveDebounce || 0) };
        const group = target.closest<HTMLElement>('[data-save-group]');
        if (group) return { field: group.dataset.saveGroup!, delay: 0 };
        if (target.closest('#home-layout')) return { field: HOME_FIELD, delay: 0 };
        return null;
    }

    // `input` cubre el tecleo (con debounce); `change` cubre selects, checkboxes y el
    // blur de los inputs de texto (por si el debounce aún no había salido).
    //
    // Los selects y checkboxes disparan LOS DOS eventos, así que aquí se ignoran: si no,
    // cada clic mandaría dos peticiones (la primera abortada por la segunda).
    root.addEventListener('input', (e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement) return;
        if (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio')) return;
        const hit = fieldOf(t);
        if (hit) queue(hit.field, hit.delay);
    });
    root.addEventListener('change', (e) => {
        const hit = fieldOf(e.target as HTMLElement);
        if (hit) queue(hit.field, 0);
    });

    // Reordenar con ↑/↓ (A4: y con el asa) no dispara ningún evento de formulario.
    document.addEventListener('yf:home-order', () => queue(HOME_FIELD, 0));
    document.addEventListener('yf:reorder', (e) => {
        const field = ((e as CustomEvent).detail as { field?: string })?.field;
        if (field && groupBox(field)) queue(field, 0);
    });

    indRetry?.addEventListener('click', () => {
        if (lastFailed) queue(lastFailed, 0);
    });

    // Con JS activo el botón "Guardar cambios" no pinta nada: se esconde y el Enter en un
    // campo de texto vacía la cola en vez de recargar la página.
    // (`hidden` no basta: `.aj-fallback` es `display:flex` y gana al UA stylesheet.)
    els('.aj-fallback').forEach((el) => { el.style.display = 'none'; });
    els('form[data-autosave-form]').forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            timers.forEach((id, field) => { window.clearTimeout(id); send(field); });
            timers.clear();
        });
    });

    // Si venimos de un guardado por POST (sin JS, o del modal de avatar), se confirma y se
    // limpia el `?saved=1` para que recargar no vuelva a decir "Guardado".
    if (new URLSearchParams(location.search).get('saved') === '1') {
        setState('saved', 'Guardado');
        const url = new URL(location.href);
        url.searchParams.delete('saved');
        history.replaceState(null, '', url.pathname + url.search);
    }
}
