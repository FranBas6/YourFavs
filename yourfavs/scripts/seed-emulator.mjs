/**
 * Siembra el emulador de Firestore con tu biblioteca REAL de la nube (una sola vez).
 *
 * Copia todo el subárbol users/{uid} (doc + todas sus subcolecciones, recursivo)
 * desde la BD cloud (yourfavsbd) al emulador local, para desarrollar con tus datos
 * de verdad sin volver a tocar la cuota cloud.
 *
 * REQUISITOS:
 *   1. El emulador tiene que estar corriendo:  npm run emu   (o emu:fresh)
 *   2. Ejecutar SIN la env del emulador (para que la lectura vaya a la NUBE):
 *        node scripts/seed-emulator.mjs [uid]
 *      Si no pasas uid y solo hay un usuario en la nube, lo detecta solo.
 *   3. Necesita cuota cloud disponible (córrelo tras el reset diario si está agotada).
 *
 * IMPORTANTE: NO lo lances con `npm run dev:emu` ni con FIRESTORE_EMULATOR_HOST puesto:
 * eso haría que la lectura "cloud" fuese también al emulador vacío. Este script abre
 * dos conexiones distintas a propósito (una a la nube, otra al emulador por settings()).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Si estuviera puesta globalmente, la conexión "cloud" leería del emulador vacío.
    console.error('❌ No ejecutes este script con FIRESTORE_EMULATOR_HOST puesto.');
    console.error('   Usa: node scripts/seed-emulator.mjs   (sin npm run dev:emu)');
    process.exit(1);
}

// --- Service account desde .env (FIREBASE_ADMIN_KEY_B64) ---
function loadServiceAccount() {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const line = env.split('\n').find((x) => x.trim().startsWith('FIREBASE_ADMIN_KEY_B64='));
    if (!line) throw new Error('No encuentro FIREBASE_ADMIN_KEY_B64 en .env');
    const b64 = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
}

const sa = loadServiceAccount();

// App CLOUD: lee de la BD real (credencial de servicio, SIN emulador).
const cloudApp = initializeApp({ credential: cert(sa), projectId: sa.projectId }, 'cloud');
const cloudDb = getFirestore(cloudApp);

// App EMULADOR: escribe en local (host explícito, sin credencial real).
const emuApp = initializeApp({ projectId: sa.projectId }, 'emu');
const emuDb = getFirestore(emuApp);
emuDb.settings({ host: EMULATOR_HOST, ssl: false });

// Copia recursiva de una colección (doc a doc + subcolecciones de cada doc).
let docCount = 0;
async function copyCollection(srcCol, dstCol) {
    const snap = await srcCol.get();
    for (const doc of snap.docs) {
        await dstCol.doc(doc.id).set(doc.data());
        docCount++;
        const subs = await doc.ref.listCollections();
        for (const sub of subs) {
            await copyCollection(sub, dstCol.doc(doc.id).collection(sub.id));
        }
    }
}

async function resolveUid() {
    const arg = process.argv[2];
    if (arg) return arg;
    // Sin arg: si solo hay un usuario en la nube, úsalo.
    const users = await cloudDb.collection('users').listDocuments();
    if (users.length === 1) return users[0].id;
    console.error(`Hay ${users.length} usuarios en la nube. Pasa el uid:`);
    users.forEach((u) => console.error('  ' + u.id));
    process.exit(1);
}

async function main() {
    const uid = await resolveUid();
    console.log(`▶ Sembrando emulador (${EMULATOR_HOST}) con users/${uid} desde la nube…`);

    const srcUser = cloudDb.doc(`users/${uid}`);
    const dstUser = emuDb.doc(`users/${uid}`);

    const userSnap = await srcUser.get();
    if (userSnap.exists) { await dstUser.set(userSnap.data()); docCount++; }

    const cols = await srcUser.listCollections();
    for (const col of cols) {
        await copyCollection(col, dstUser.collection(col.id));
        console.log(`  ✓ ${col.id}`);
    }

    console.log(`✅ Listo: ${docCount} documentos copiados a users/${uid} en el emulador.`);
    console.log('   Al cerrar el emulador (Ctrl+C) se guardan en .emulator-data/ para la próxima.');
    process.exit(0);
}

main().catch((err) => { console.error('❌ Error sembrando:', err); process.exit(1); });
