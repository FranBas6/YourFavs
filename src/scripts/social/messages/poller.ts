/**
 * Sondeo con la pestaña a la vista (mensajes M1/M2, sin tiempo real hasta M3; handoff §7):
 * 5 s con una conversación abierta, 30 s para la lista y el contador.
 *
 *   · Nunca solapa: la siguiente vuelta se programa cuando acaba la anterior.
 *   · Pestaña oculta → en pausa. Al volver → una vuelta en el acto y sigue el ritmo.
 *   · Sin indicador de «actualizando»: si falla, se reintenta con más calma (`nextDelay`).
 *   · Con el tiempo real conectado (M3) el ritmo baja (`setBase`): el sondeo queda de respaldo.
 */
export interface Poller {
    start(): void;
    stop(): void;
    /** Una vuelta ya (p. ej. justo después de enviar), sin esperar al intervalo. */
    now(): void;
    /** Cambia el ritmo normal (lo usa el tiempo real: con él conectado, más despacio). */
    setBase(ms: number): void;
}

/** Tope de espera entre vueltas cuando fallan seguidas. */
const MAX_DELAY_MS = 60_000;

/**
 * Cuánto esperar hasta la próxima vuelta.
 * @param baseMs   el ritmo normal (5.000 en el chat, 30.000 en la lista)
 * @param failures vueltas seguidas que han fallado (0 = la última fue bien)
 */
export function nextDelay(baseMs: number, failures: number): number {
    // Si falla, se dobla la espera (5 → 10 → 20 → 40 → 60 s en el chat) hasta un minuto: no se
    // insiste contra un servidor caído. Volver a la pestaña o enviar preguntan en el acto igualmente.
    return Math.min(baseMs * 2 ** Math.min(failures, 10), MAX_DELAY_MS);
}

/** `task` devuelve true si la vuelta fue bien. */
export function createPoller(task: () => Promise<boolean>, baseMs: number): Poller {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let busy = false;
    let failures = 0;

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const schedule = () => {
        clear();
        if (running && document.visibilityState === 'visible') timer = setTimeout(tick, nextDelay(baseMs, failures));
    };
    async function tick() {
        timer = null;
        if (!running || busy) return;
        busy = true;
        try { failures = (await task()) ? 0 : failures + 1; } catch { failures += 1; }
        busy = false;
        schedule();
    }
    const onVisibility = () => {
        if (document.visibilityState === 'visible') void tick();
        else clear();
    };

    return {
        start() {
            if (running) return;
            running = true;
            document.addEventListener('visibilitychange', onVisibility);
            schedule();
        },
        stop() {
            running = false;
            clear();
            document.removeEventListener('visibilitychange', onVisibility);
        },
        now() { clear(); void tick(); },
        setBase(ms: number) {
            if (ms === baseMs) return;
            baseMs = ms;
            if (running && timer) schedule();
        },
    };
}
