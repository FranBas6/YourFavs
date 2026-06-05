/**
 * Acciones de autenticación (lado cliente) — Fase B.2.
 *
 * Aísla todo lo que toca `firebase/auth` para poder cargarlo en DIFERIDO
 * (import dinámico) y no meter ~236 kB en el bundle de cada página: solo se
 * descarga al abrir el modal o cuando ya hay una sesión que renovar.
 *
 * Cada acción devuelve un AuthResult uniforme con el error YA traducido al
 * español, para que la UI solo tenga que pintarlo.
 */
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    type AuthError,
} from 'firebase/auth';
import { clientAuth, googleProvider, syncSessionCookie } from './firebaseAuthClient';

export type AuthResult = { ok: true } | { ok: false; error: string };

/** Traduce los códigos de error de Firebase Auth a mensajes en español. */
export function mapAuthError(code: string | undefined): string {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'Ese email ya tiene una cuenta. Inicia sesión.';
        case 'auth/invalid-email':
            return 'El email no es válido.';
        case 'auth/missing-password':
            return 'Escribe una contraseña.';
        case 'auth/weak-password':
            return 'La contraseña debe tener al menos 6 caracteres.';
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Email o contraseña incorrectos.';
        case 'auth/user-not-found':
            return 'No hay ninguna cuenta con ese email.';
        case 'auth/user-disabled':
            return 'Esta cuenta está deshabilitada.';
        case 'auth/too-many-requests':
            return 'Demasiados intentos. Inténtalo de nuevo en un rato.';
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'Has cerrado la ventana de Google.';
        case 'auth/popup-blocked':
            return 'Tu navegador bloqueó la ventana de Google. Permite los popups.';
        case 'auth/network-request-failed':
            return 'Sin conexión. Revisa tu red e inténtalo de nuevo.';
        default:
            return 'Algo salió mal. Inténtalo de nuevo.';
    }
}

// Tras un login correcto en el client SDK, emitimos la cookie de sesión del
// servidor. Si eso falla, la sesión no quedaría reconocida por el SSR.
async function finishLogin(): Promise<AuthResult> {
    const ok = await syncSessionCookie();
    return ok ? { ok: true } : { ok: false, error: 'No se pudo crear la sesión. Inténtalo de nuevo.' };
}

export async function loginGoogle(): Promise<AuthResult> {
    try {
        await signInWithPopup(clientAuth, googleProvider);
        return await finishLogin();
    } catch (e) {
        return { ok: false, error: mapAuthError((e as AuthError).code) };
    }
}

export async function loginEmail(email: string, password: string): Promise<AuthResult> {
    try {
        await signInWithEmailAndPassword(clientAuth, email, password);
        return await finishLogin();
    } catch (e) {
        return { ok: false, error: mapAuthError((e as AuthError).code) };
    }
}

export async function registerEmail(email: string, password: string): Promise<AuthResult> {
    try {
        await createUserWithEmailAndPassword(clientAuth, email, password);
        return await finishLogin();
    } catch (e) {
        return { ok: false, error: mapAuthError((e as AuthError).code) };
    }
}

export async function resetPassword(email: string): Promise<AuthResult> {
    try {
        await sendPasswordResetEmail(clientAuth, email);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: mapAuthError((e as AuthError).code) };
    }
}

/** Cierra sesión: cookie del servidor + sesión del client SDK. */
export async function logout(): Promise<void> {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* da igual */ }
    try { await signOut(clientAuth); } catch { /* da igual */ }
}

/**
 * "Sesión continua" (rolling): cuando el client SDK restaura al usuario, renueva
 * la cookie de 14 días. Solo se invoca si ya había sesión (cookie has_session),
 * así que un invitado nunca descarga firebase/auth.
 */
export function rollingSync(): void {
    onAuthStateChanged(clientAuth, async (user) => {
        if (user) await syncSessionCookie();
    });
}
