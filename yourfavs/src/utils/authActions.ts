/**
 * Acciones de autenticación (lado cliente).
 *
 * Las mismas funciones que usa `AuthModal` desde la Fase B.2, pero ya sin librería de auth en el
 * navegador: cada acción es un `fetch` a `src/pages/api/auth/*`, donde Supabase hace el trabajo y
 * deja la sesión en cookies `httpOnly`. Antes esto cargaba `firebase/auth` (~236 kB) en diferido;
 * ahora pesa lo que pesa este archivo.
 *
 * Cada acción devuelve un AuthResult uniforme con el error YA traducido al español (lo traduce
 * el servidor), para que la UI solo tenga que pintarlo.
 */

// `isNewUser`: cuenta recién creada (registro). La usa el modal para llevar al
// onboarding de gustos solo en el primer acceso (Fase F · Acceso A).
export type AuthResult = { ok: true; isNewUser?: boolean } | { ok: false; error: string };

async function post(path: string, body?: unknown): Promise<AuthResult & { url?: string }> {
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (data?.ok) return { ok: true, isNewUser: data.isNewUser === true, url: data.url };
        return { ok: false, error: data?.error || 'Algo salió mal. Inténtalo de nuevo.' };
    } catch {
        return { ok: false, error: 'Sin conexión. Revisa tu red e inténtalo de nuevo.' };
    }
}

/**
 * Google con redirección de página completa (ver `api/auth/google.ts`). Si todo va bien NO
 * vuelve nunca: el navegador se va a Google, y al regresar `/auth/callback` trae `?auth=…`,
 * que recoge el modal al cargar. Por eso la promesa se queda pendiente y el botón en «Un
 * momento…» hasta que la página se va.
 */
export async function loginGoogle(): Promise<AuthResult> {
    const res = await post('/api/auth/google', { next: location.pathname + location.search });
    if (!res.ok || !res.url) return res.ok ? { ok: false, error: 'Algo salió mal. Inténtalo de nuevo.' } : res;
    location.assign(res.url);
    return new Promise<AuthResult>(() => { /* la página se va a Google */ });
}

export function loginEmail(email: string, password: string): Promise<AuthResult> {
    return post('/api/auth/login', { email, password });
}

export function registerEmail(email: string, password: string): Promise<AuthResult> {
    return post('/api/auth/register', { email, password });
}

export function resetPassword(email: string): Promise<AuthResult> {
    return post('/api/auth/reset', { email });
}

/** Cierra sesión en el servidor (revoca y borra las cookies). */
export async function logout(): Promise<void> {
    await post('/api/auth/logout');
}
