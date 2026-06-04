/**
 * Firebase Auth — lado CLIENTE (navegador).
 *
 * Reutiliza la app ya inicializada en firebaseConfig.ts (client SDK, env
 * PUBLIC_*). Aquí añadimos `auth`, el proveedor de Google y el helper de
 * "sesión continua". El flujo (Fase B): login → ID token → POST /api/auth/session
 * (emite la cookie). Es seguro en el bundle del cliente: las claves PUBLIC_* son
 * públicas por diseño; la credencial admin NUNCA pasa por aquí.
 */
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { app } from './firebaseConfig';

export const clientAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// "Sesión continua" (plug & play): el client SDK persiste al usuario en el
// navegador indefinidamente (refresh token de larga vida). browserLocalPersistence
// es el default, pero lo dejamos explícito como decisión de diseño.
setPersistence(clientAuth, browserLocalPersistence).catch((e) =>
    console.error('[auth] no se pudo fijar la persistencia local:', e)
);

/**
 * Renueva la cookie de sesión del servidor a partir del usuario actual del
 * client SDK. Se llamará al cargar la app (Fase B): si hay usuario, pide un ID
 * token fresco y re-emite la cookie de 14 días → ventana DESLIZANTE ("rolling"),
 * por lo que la sesión no caduca mientras entres al menos una vez cada 14 días.
 * Devuelve true si renovó, false si no había usuario.
 */
export async function syncSessionCookie(): Promise<boolean> {
    const user = clientAuth.currentUser;
    if (!user) return false;
    const idToken = await user.getIdToken(/* forceRefresh */ true);
    const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });
    return res.ok;
}
