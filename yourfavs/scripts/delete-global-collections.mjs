/**
 * Borra las colecciones globales antiguas TRAS migrar a users/{uid} (Fase C.6).
 * Admin SDK (bypassa las reglas). NO toca la colección `users`.
 *
 *   node scripts/delete-global-collections.mjs            # dry-run (no borra)
 *   node scripts/delete-global-collections.mjs --confirm  # borra de verdad
 *
 * Red de seguridad: el backup JSON de C.0 (scripts/backups/{fecha}/) + la copia
 * ya migrada en users/{uid}. Aun así, borrar es irreversible: requiere --confirm.
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const GLOBAL_COLLECTIONS = [
    'MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies',
    'SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto',
    'WatchedEpisodes', 'ActorsFavs', 'FollowedPeople', 'MediaTags', 'NotificationSubs',
];

const confirm = process.argv.includes('--confirm');

const sa = JSON.parse(Buffer.from(
    fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^FIREBASE_ADMIN_KEY_B64=(.+)$/m)[1],
    'base64'
).toString('utf8'));
const app = initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore(app);

console.log(`\n🗑️  Borrado de colecciones globales  (proyecto: ${sa.project_id})${confirm ? '' : '   [DRY-RUN — no borra, usa --confirm]'}\n`);

let total = 0;
for (const col of GLOBAL_COLLECTIONS) {
    const snap = await db.collection(col).get();
    if (confirm && snap.size > 0) {
        let batch = db.batch();
        let pending = 0;
        for (const docSnap of snap.docs) {
            batch.delete(docSnap.ref);
            pending++;
            if (pending === 450) { await batch.commit(); batch = db.batch(); pending = 0; }
        }
        if (pending > 0) await batch.commit();
    }
    console.log(`  ${confirm ? '🗑️ ' : '•'} ${col}: ${snap.size} docs`);
    total += snap.size;
}

console.log(`\n📊 Total: ${total} docs ${confirm ? 'borrados' : '(no borrados — dry-run)'}\n`);
process.exit(0);
