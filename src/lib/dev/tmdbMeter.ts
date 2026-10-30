/**
 * Medidor de llamadas a TMDB por página — SOLO en `astro dev` (C0 del plan TMDB, 2026-10-29).
 *
 * Para consolidar las fichas (C1/C2) hace falta medir antes y después con números, no a ojo.
 * Envuelve `fetch` una vez (así cuenta también los `fetch` en crudo que no pasan por `tmdbFetch`),
 * anota cada llamada en el store de la petición (`userScope`) y, cuando el HTML termina de
 * enviarse, escribe una línea en la consola del servidor:
 *
 *   [tmdb] 32 llamadas · 4 repetidas · /movie/550 · 1830 ms · /movie/{id}×3 /movie/{id}/credits×2 …
 *
 * Se cuenta al terminar el cuerpo (no al volver `next()`) porque Astro renderiza en streaming y
 * los componentes hacen sus propias llamadas mientras se envía la página.
 * En producción el middleware ni lo instala: `import.meta.env.DEV` es `false` y Vite lo elimina.
 */
import { recordTmdbCall } from '../../services/BD/shared/userScope';

let installed = false;

/** Ruta + parámetros de una llamada a TMDB, sin la clave. */
function describe(url: string): string | null {
    if (!url.includes('api.themoviedb.org')) return null;
    try {
        const u = new URL(url);
        u.searchParams.delete('api_key');
        u.searchParams.delete('language');
        const q = u.searchParams.toString();
        return u.pathname.replace(/^\/3/, '') + (q ? `?${q}` : '');
    } catch {
        return null;
    }
}

export function installTmdbMeter(): void {
    if (installed) return;
    installed = true;
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const call = describe(url);
        if (call) recordTmdbCall(call);
        return original(input, init);
    }) as typeof fetch;
}

/** `/tv/1399/season/3/credits?x=1` → `/tv/{id}/season/{n}/credits` (para agrupar). */
const shape = (call: string) => call.split('?')[0].replace(/\/\d+/g, '/{id}');

function report(path: string, calls: string[], t0: number): void {
    if (!calls.length) return;
    const repeated = calls.length - new Set(calls).size;
    const groups = new Map<string, number>();
    for (const c of calls) groups.set(shape(c), (groups.get(shape(c)) ?? 0) + 1);
    const top = [...groups.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
        .join(' ');
    console.log(`[tmdb] ${calls.length} llamadas · ${repeated} repetidas · ${path} · ${Date.now() - t0} ms · ${top}`);
}

/**
 * Devuelve la respuesta con el cuerpo envuelto para informar al terminar de enviarlo.
 * Las respuestas sin cuerpo informan en el acto.
 */
export function withTmdbReport(response: Response, path: string, calls: string[], t0: number): Response {
    if (!response.body) {
        report(path, calls, t0);
        return response;
    }
    const body = response.body.pipeThrough(new TransformStream({ flush: () => report(path, calls, t0) }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
