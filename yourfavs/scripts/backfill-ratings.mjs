/**
 * Backfill one-off: sembrar VALORACIONES (Ratings) desde las notas inline (4.2).
 *
 * Hasta ahora las notas vivían inline en cada lista (`rating:number`) sin
 * timestamp. La colección users/{uid}/Ratings/{media_type}_{tmdb_id} guarda
 * `{score, created_at, updated_at}` y alimenta la Actividad. Para que el historial
 * no "empiece hoy", este script recorre las notas existentes y crea la entrada
 * con fecha = `added_at` de la lista (la más antigua si la nota está en varias).
 *
 *   - Una peli/serie puede estar en varias listas con `rating`: se toma la nota
 *     MÁS ALTA (consistente con yearStats.buildRawMap) y el added_at MÁS ANTIGUO.
 *   - created_at = updated_at = esa fecha → el evento sale como "Has valorado"
 *     (no "actualizada").
 *
 * IDEMPOTENTE: salta lo que ya está en Ratings. Correrlo dos veces no duplica.
 *
 *   node scripts/backfill-ratings.mjs <uid> [--dry-run]
 *
 * --dry-run: solo cuenta, no escribe. Usa FIREBASE_ADMIN_KEY_B64 (.env).
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uid = args.find((a) => !a.startsWith('--'));

if (!uid) {
    console.error('Uso: node scripts/backfill-ratings.mjs <uid> [--dry-run]');
    process.exit(1);
}

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^FIREBASE_ADMIN_KEY_B64=(.+)$/m);
if (!m) { console.error('Falta FIREBASE_ADMIN_KEY_B64 en .env'); process.exit(1); }
const sa = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));

const app = initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
});
const db = getFirestore(app);
const userCol = (name) => db.collection('users').doc(uid).collection(name);

const MOVIE_COLLECTIONS = ['MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies'];
const SERIE_COLLECTIONS = ['SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries', 'SeriesVerPronto'];

/** Timestamp | Date | string → Date (o ahora si no se puede). */
function toDate(v) {
    let d = null;
    if (v && typeof v.toDate === 'function') d = v.toDate();
    else if (v instanceof Date) d = v;
    else if (typeof v === 'string') d = new Date(v);
    else if (v && typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
    if (!d || isNaN(d.getTime())) d = new Date();
    return d;
}

console.log(`\n⭐ Backfill valoraciones → users/${uid}/Ratings   (proyecto: ${sa.project_id})${dryRun ? '   [DRY-RUN — no escribe]' : ''}\n`);

// 1) Estado actual de Ratings → no duplicar.
const existing = await userCol('Ratings').get();
const seen = new Set(existing.docs.map((d) => d.id));
console.log(`   Ratings actual: ${existing.size} entradas\n`);

// 2) Recolectar notas inline (mejor nota + added_at más antiguo por título).
//    clave = `${media_type}_${tmdb_id}` (= id del doc en Ratings).
const collected = new Map(); // key → { media_type, tmdb_id, score, date:Date }

async function collect(collections, mediaType) {
    for (const col of collections) {
        const snap = await userCol(col).get();
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const score = Number(data.rating || 0);
            if (!score || score < 1 || score > 10) continue;
            const tmdbId = String(data.id || docSnap.id);
            const key = `${mediaType}_${tmdbId}`;
            const date = toDate(data.added_at);
            const cur = collected.get(key);
            if (cur) {
                if (score > cur.score) cur.score = score;
                if (date < cur.date) cur.date = date;
            } else {
                collected.set(key, { media_type: mediaType, tmdb_id: tmdbId, score, date });
            }
        }
    }
}

await collect(MOVIE_COLLECTIONS, 'movie');
await collect(SERIE_COLLECTIONS, 'tv');

const movieCount = [...collected.values()].filter((c) => c.media_type === 'movie').length;
const tvCount = [...collected.values()].filter((c) => c.media_type === 'tv').length;
console.log(`   Notas inline encontradas: ${collected.size} (${movieCount} pelis, ${tvCount} series)`);

// 3) Escribir las que falten.
let written = 0;
const batchLimit = 400;
let batch = db.batch();
let pending = 0;
for (const [key, c] of collected) {
    if (seen.has(key)) continue;
    written++;
    if (dryRun) continue;
    const ref = userCol('Ratings').doc(key);
    batch.set(ref, {
        media_type: c.media_type,
        tmdb_id: c.tmdb_id,
        score: c.score,
        created_at: c.date,
        updated_at: c.date,
        source: 'backfill',
    });
    if (++pending >= batchLimit) { await batch.commit(); batch = db.batch(); pending = 0; }
}
if (!dryRun && pending > 0) await batch.commit();

console.log(`   ✍️  Nuevas valoraciones sembradas: ${written}${dryRun ? ' (dry-run, no escritas)' : ''}\n`);
console.log('✅ Backfill completo.\n');
process.exit(0);
