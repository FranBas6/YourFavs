/**
 * Ayudas de los endpoints `api/social/*`: todos piden sesión, reciben `{ userId }` y responden
 * `{ ok, relation?, error? }` sin caché (handoff §9).
 */
import { jsonNoStore } from '../http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export const unauthorized = () => jsonNoStore({ ok: false, error: 'auth' }, 401);
export const badRequest = (error = 'bad_request') => jsonNoStore({ ok: false, error }, 400);
export const tooMany = () => jsonNoStore({ ok: false, error: 'rate_limited' }, 429);
export const serverError = (where: string, err: unknown) => {
    console.error(`[${where}]`, (err as Error)?.message ?? err);
    return jsonNoStore({ ok: false, error: 'server' }, 500);
};

/** Lee `userId` del cuerpo JSON; null si falta o no es un uuid. */
export async function readUserId(request: Request): Promise<string | null> {
    const body = await request.json().catch(() => null);
    const id = body?.userId;
    return isUuid(id) ? id.toLowerCase() : null;
}
