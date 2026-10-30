/**
 * «Volver a donde estabas» (idea de Fran): en el móvil, entrar en Mensajes desde la cabecera, un
 * aviso o un perfil te saca de lo que estabas mirando; el botón `[data-ms-from]` de Mensajes y de la
 * conversación (`MsFrom.astro`) te devuelve allí sin tener que buscarlo otra vez.
 *
 *   · Fuera de Mensajes, cada página anota al irse dónde estaba y cuánto había bajado
 *     (`yf:ms-last`, por pestaña). `MsFrom.astro` la toma como origen (`yf:ms-from`) si vienes de ella.
 *   · Al pulsar: si el navegador tiene la Navigation API y el origen está justo detrás de las
 *     páginas de Mensajes en el historial, se vuelve a esa entrada; si no, se carga de nuevo. Si la
 *     página no vuelve tal cual (de la bfcache), se baja a donde estabas (`yf:ms-restore`, 15 s).
 *
 * Se carga con la capa social (`SocialLayer.astro`) en cualquier página con sesión.
 */
const MS = /^\/mislistas\/amigos\/mensajes(\/|$)/;
const LAST = 'yf:ms-last';
const FROM = 'yf:ms-from';
const RESTORE = 'yf:ms-restore';

interface Origin { url: string; title: string; y?: number; at?: number }

const here = () => location.pathname + location.search;
const read = (k: string): Origin | null => {
    try { return JSON.parse(sessionStorage.getItem(k) ?? 'null'); } catch { return null; }
};
const write = (k: string, v: Origin | null) => {
    try { if (v) sessionStorage.setItem(k, JSON.stringify(v)); else sessionStorage.removeItem(k); } catch { /* sin almacenamiento */ }
};

if (!MS.test(location.pathname)) {
    // Volviendo con el botón: la página se ha cargado de nuevo, así que se baja a donde estabas.
    const back = read(RESTORE);
    if (back) {
        write(RESTORE, null);
        if (back.url === here() && back.y && Date.now() - (back.at ?? 0) < 15_000) {
            const go = () => window.scrollTo(0, back.y!);
            if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
        }
    }
    // Si vuelve de la bfcache ya está donde estaba: la marca sobra.
    addEventListener('pageshow', (e) => { if (e.persisted) write(RESTORE, null); });
    addEventListener('pagehide', () => write(LAST, { url: here(), title: document.title, y: Math.round(window.scrollY) }));
} else {
    document.addEventListener('click', (e) => {
        const a = (e.target as Element).closest?.<HTMLAnchorElement>('a[data-ms-from]');
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
        const from = read(FROM);
        if (!from) return;
        e.preventDefault();
        write(FROM, null);
        write(RESTORE, { ...from, at: Date.now() });
        // Detrás de esta página solo hay Mensajes hasta el origen → se vuelve a esa entrada del historial.
        const nav = (window as any).navigation;
        if (nav?.entries && nav.currentEntry) {
            const entries = nav.entries();
            for (let i = nav.currentEntry.index - 1; i >= 0; i--) {
                const u = new URL(entries[i].url);
                if (u.origin === location.origin && u.pathname + u.search === from.url) { nav.traverseTo(entries[i].key); return; }
                if (u.origin !== location.origin || !MS.test(u.pathname)) break;
            }
        }
        location.assign(from.url);
    });
}
