/**
 * Migración one-off: colecciones globales → users/{uid}/{Coleccion} (Fase C).
 *
 * REUTILIZABLE en dev y PRODUCCIÓN: usa el Admin SDK con la service account de
 * FIREBASE_ADMIN_KEY_B64 (en .env). Para migrar producción: pon en .env la
 * service account del proyecto de prod + pasa el UID de prod. Mismo comando.
 *
 *   node scripts/migrate-to-user.mjs <uid> [--dry-run]
 *
 * --dry-run: solo cuenta, no escribe nada (para verificar antes de migrar).
 * Idempotente: copia con set() (sobrescribe), correrlo dos veces es seguro.
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = [
    'MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies',
    'SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto',
    'WatchedEpisodes', 'ActorsFavs', 'FollowedPeople', 'MediaTags', 'NotificationSubs',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uid = args.find((a) => !a.startsWith('--'));

if (!uid) {
    console.error('Uso: node scripts/migrate-to-user.mjs <uid> [--dry-run]');
    process.exit(1);
}

// Credenciales desde .env (FIREBASE_ADMIN_KEY_B64), sin exponerlas.
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^FIREBASE_ADMIN_KEY_B64=(.+)$/m);
if (!m) {
    console.error('Falta FIREBASE_ADMIN_KEY_B64 en .env');
    process.exit(1);
}
const sa = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));

const app = initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore(app);

console.log(`\n🚚 Migración → users/${uid}/…   (proyecto: ${sa.project_id})${dryRun ? '   [DRY-RUN — no escribe]' : ''}\n`);

let total = 0;
for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();

    if (!dryRun && snap.size > 0) {
        let batch = db.batch();
        let pending = 0;
        for (const docSnap of snap.docs) {
            const dest = db.collection('users').doc(uid).collection(col).doc(docSnap.id);
            batch.set(dest, docSnap.data());
            pending++;
            if (pending === 450) { await batch.commit(); batch = db.batch(); pending = 0; }
        }
        if (pending > 0) await batch.commit();
    }

    console.log(`  ${dryRun ? '•' : '✅'} ${col}: ${snap.size} docs`);
    total += snap.size;
}

console.log(`\n📊 Total: ${total} docs ${dryRun ? '(no escritos — dry-run)' : `copiados a users/${uid}/`}\n`);
process.exit(0);
