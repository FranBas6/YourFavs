/**
 * Limpieza puntual: borra las notificaciones de tipo 'on_platform' ya materializadas
 * (el grupo "Pendientes en tus plataformas" se retiró de la campana). Idempotente.
 *
 *   node scripts/clean-notif-onplatform.mjs [--dry-run]
 *
 * Usa la service account de FIREBASE_ADMIN_KEY_B64 (.env).
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^FIREBASE_ADMIN_KEY_B64=(.+)$/m);
if (!m) { console.error('Falta FIREBASE_ADMIN_KEY_B64 en .env'); process.exit(1); }
const sa = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));

const app = initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore(app);

console.log(`\n🧹 Limpieza notificaciones 'on_platform' (proyecto: ${sa.project_id})${dryRun ? '  [DRY-RUN]' : ''}\n`);

const users = await db.collection('users').get();
let total = 0;
for (const u of users.docs) {
    const snap = await u.ref.collection('notifications').where('type', '==', 'on_platform').get();
    if (snap.empty) continue;
    console.log(`   [${u.id}] ${snap.size} on_platform`);
    if (!dryRun) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
    total += snap.size;
}
console.log(`\n✅ ${dryRun ? 'Se borrarían' : 'Borradas'} ${total}\n`);
process.exit(0);
