/**
 * Respuesta JSON de las rutas nuevas (`api/profile/*` del perfil público). Siempre `no-store`:
 * llevan datos del usuario en sesión y no deben quedarse en ninguna caché compartida.
 */
export function jsonNoStore(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
}
