/**
 * Tiempo real (mensajes M3; PLAN_MENSAJES.md, «Resultado de M0», opción A).
 *
 * Escucha el canal público con nombre secreto `u:{rt_key}` (el nombre solo te lo da el servidor,
 * en `#yf-live`, con sesión). Por él no viaja contenido: solo «avisos vacíos» que dicen dónde mirar,
 * y se traducen a eventos para que cada pieza pida lo suyo al servidor como siempre:
 *   · {c: id} → `yf:live-msg` ({ convs: [id…] }): la conversación abierta, la lista y el contador.
 *   · {n: 1}  → `yf:live-notif`: la campana y el rojo de solicitudes.
 *   · `yf:live-status` ({ up }): con el canal conectado, el sondeo de M1 baja el ritmo (queda de
 *     respaldo); si se cae, vuelve al de siempre.
 *
 * Solo con la pestaña a la vista: al ocultarla se desconecta (pasados 30 s, para no reconectar al
 * cambiar de pestaña un momento) y al volver se conecta otra vez. Los avisos seguidos se agrupan
 * (250 ms), así que una ráfaga —o un aviso falso— nunca provoca una ráfaga de peticiones.
 */
export {};

interface LiveCfg { url: string; key: string; topic: string }

declare global {
    interface Window { yfLive?: { up: boolean } }
}

type Channel = { unsubscribe(): unknown };
type Client = { channel(topic: string, o: object): any; disconnect(): unknown; removeAllChannels?(): unknown };

const raw = document.getElementById('yf-live')?.textContent;
const cfg: LiveCfg | null = (() => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } })();

let client: Client | null = null;
let channel: Channel | null = null;
let connecting = false;
let hideTimer = 0;
window.yfLive = { up: false };

function setUp(up: boolean) {
    if (window.yfLive!.up === up) return;
    window.yfLive!.up = up;
    document.dispatchEvent(new CustomEvent('yf:live-status', { detail: { up } }));
}

// ---- Avisos agrupados -------------------------------------------------------------------------
let convs = new Set<number>();
let notif = false;
let flushTimer = 0;
function queue(payload: Record<string, unknown>) {
    if (typeof payload.c === 'number' && Number.isSafeInteger(payload.c)) convs.add(payload.c);
    if (payload.n) notif = true;
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
        flushTimer = 0;
        if (convs.size) document.dispatchEvent(new CustomEvent('yf:live-msg', { detail: { convs: [...convs] } }));
        if (notif) document.dispatchEvent(new CustomEvent('yf:live-notif'));
        convs = new Set();
        notif = false;
    }, 250);
}

// ---- Conectar y desconectar -------------------------------------------------------------------
async function connect() {
    if (!cfg || client || connecting) return;
    connecting = true;
    try {
        const { RealtimeClient } = await import('@supabase/realtime-js');
        const c = new RealtimeClient(cfg.url, { params: { apikey: cfg.key } }) as unknown as Client;
        client = c;
        const ch = c.channel(cfg.topic, { config: { private: false } });
        ch.on('broadcast', { event: 'ping' }, (m: { payload?: Record<string, unknown> }) => queue(m.payload ?? {}));
        ch.subscribe((status: string) => {
            if (client !== c) return;
            // Al (re)conectar se pide todo una vez: lo que llegó mientras no escuchábamos.
            if (status === 'SUBSCRIBED') { setUp(true); queue({ n: 1 }); document.dispatchEvent(new CustomEvent('yf:live-msg', { detail: { convs: [] } })); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setUp(false);
        });
        channel = ch;
    } catch {
        client = null;
        setUp(false);
    } finally {
        connecting = false;
    }
}

function disconnect() {
    try { channel?.unsubscribe(); client?.disconnect(); } catch { /* ya estaba cerrado */ }
    channel = null;
    client = null;
    setUp(false);
}

if (cfg) {
    if (document.visibilityState === 'visible') void connect();
    document.addEventListener('visibilitychange', () => {
        window.clearTimeout(hideTimer);
        if (document.visibilityState === 'visible') void connect();
        else hideTimer = window.setTimeout(disconnect, 30_000);
    });
    window.addEventListener('pagehide', disconnect);
}
