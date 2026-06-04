/**
 * Firebase Admin SDK — SOLO servidor.
 *
 * Verifica las cookies de sesión (SSR) y, en la Fase C, hará todo el acceso a
 * Firestore autenticado por servicio. Se inicializa con la service account que
 * vive en la env PRIVADA `FIREBASE_ADMIN_KEY_B64` (base64 del JSON). NUNCA debe
 * importarse desde código que llegue al navegador: filtraría credenciales.
 *
 * Pasos de consola para generar la clave → docs/firebase_setup_runbook.md
 */
import { initializeApp, getApps, getApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function loadServiceAccount(): ServiceAccount {
    // En Astro server import.meta.env expone las env privadas; en Netlify
    // Functions el runtime las da por process.env. Cubrimos ambos.
    const b64 = import.meta.env.FIREBASE_ADMIN_KEY_B64 ?? process.env.FIREBASE_ADMIN_KEY_B64;
    if (!b64) {
        throw new Error(
            'Falta FIREBASE_ADMIN_KEY_B64 (service account en base64). ' +
            'En local va en .env; en Netlify en Site settings → Environment variables.'
        );
    }
    try {
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        return {
            projectId: json.project_id,
            clientEmail: json.client_email,
            privateKey: json.private_key,
        };
    } catch (err) {
        throw new Error('FIREBASE_ADMIN_KEY_B64 no es un base64 de JSON válido: ' + (err as Error).message);
    }
}

// Singleton: Astro puede reimportar el módulo; initializeApp solo una vez.
const adminApp = getApps().length ? getApp() : initializeApp({ credential: cert(loadServiceAccount()) });

export const adminAuth = getAuth(adminApp);
export { adminApp };
