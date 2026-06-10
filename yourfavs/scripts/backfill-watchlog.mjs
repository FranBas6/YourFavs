/**
 * Backfill one-off: sembrar el DIARIO (WatchLog) desde lo ya marcado (Fase L6).
 *
 * Para que el diario no "empiece hoy": recorre lo que ya tienes marcado y crea
 * las entradas históricas que faltan en users/{uid}/WatchLog.
 *   - Películas: cada peli en MoviesVistas ∪ LikedMovies ∪ MovieFavs → UNA entrada
 *     (dedup por tmdb_id), fecha = `added_at` de la lista (la más antigua).
 *   - Series: cada episodio de WatchedEpisodes → una entrada, fecha = `watched_at`.
 *
 * IDEMPOTENTE: salta lo que ya está en WatchLog (pelis ya registradas y episodios
 * ya registrados por season:episode). Correrlo dos veces no duplica.
 *
 *   node scripts/backfill-watchlog.mjs <uid> [--dry-run]
 *
 * --dry-run: solo cuenta, no escribe. Usa la service account de FIREBASE_ADMIN_KEY_B64 (.env).
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uid = args.find((a) => !a.startsWith('--'));

if (!uid) {
    console.error('Uso: node scripts/backfill-watchlog.mjs <uid> [--dry-run]');
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

const MOVIE_WATCHED = ['MoviesVistas', 'LikedMovies', 'MovieFavs']; // "visto" = unión de los 3

/** Normaliza Timestamp | Date | string → 'YYYY-MM-DD' (o hoy si no se puede). */
function toDateStr(v) {
    let d = null;
    if (v && typeof v.toDate === 'function') d = v.toDate();
    else if (v instanceof Date) d = v;
    else if (typeof v === 'string') d = new Date(v);
    else if (v && typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
    if (!d || isNaN(d.getTime())) d = new Date();
    return d.toISOString().slice(0, 10);
}

console.log(`\n📖 Backfill diario → users/${uid}/WatchLog   (proyecto: ${sa.project_id})${dryRun ? '   [DRY-RUN — no escribe]' : ''}\n`);

// 1) Estado actual del WatchLog → para no duplicar.
const existing = await userCol('WatchLog').get();
const seenMovies = new Set();           // tmdb_id (string)
const seenEpisodes = new Set();         // `${tmdb_id}:${season}:${episode}`
for (const d of existing.docs) {
    const x = d.data();
    if (x.media_type === 'movie') seenMovies.add(String(x.tmdb_id));
    else if (x.media_type === 'tv' && x.season != null && x.episode != null) {
        seenEpisodes.add(`${x.tmdb_id}:${x.season}:${x.episode}`);
    }
}
console.log(`   WatchLog actual: ${existing.size} entradas (${seenMovies.size} pelis, ${seenEpisodes.size} episodios)\n`);

const now = new Date();
const toWrite = [];

// 2) Películas: dedup por id, fecha = added_at más antiguo entre las listas "visto".
const movieDate = new Map(); // tmdb_id → 'YYYY-MM-DD' (la más antigua)
for (const col of MOVIE_WATCHED) {
    const snap = await userCol(col).get();
    for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const ds = toDateStr(docSnap.data().added_at);
        const prev = movieDate.get(id);
        if (!prev || ds < prev) movieDate.set(id, ds);
    }
}
let newMovies = 0;
for (const [id, ds] of movieDate) {
    if (seenMovies.has(String(id))) continue;
    toWrite.push({ media_type: 'movie', tmdb_id: Number(id), watched_on: ds, rewatch: false, logged_at: now, source: 'backfill' });
    newMovies++;
}
console.log(`   🎬 Pelis vistas: ${movieDate.size} · nuevas al diario: ${newMovies}`);

// 3) Series: un episodio = una entrada, fecha = watched_at.
const epSnap = await userCol('WatchedEpisodes').get();
let newEpisodes = 0, totalEps = 0;
for (const docSnap of epSnap.docs) {
    const data = docSnap.data();
    const serieId = data.id || docSnap.id;
    for (const ep of data.watched_episodes || []) {
        if (ep.season == null || ep.episode == null) continue;
        totalEps++;
        const key = `${serieId}:${ep.season}:${ep.episode}`;
        if (seenEpisodes.has(key)) continue;
        seenEpisodes.add(key); // por si el array trae duplicados
        toWrite.push({
            media_type: 'tv', tmdb_id: Number(serieId), season: ep.season, episode: ep.episode,
            watched_on: toDateStr(ep.watched_at), rewatch: false, logged_at: now, source: 'backfill',
        });
        newEpisodes++;
    }
}
console.log(`   📺 Episodios vistos: ${totalEps} · nuevos al diario: ${newEpisodes}`);

console.log(`\n   → Total a crear: ${toWrite.length}\n`);

if (dryRun) {
    console.log('   [DRY-RUN] No se ha escrito nada.\n');
    process.exit(0);
}

// 4) Escritura en lotes (límite 450 por batch).
let batch = db.batch();
let pending = 0, written = 0;
for (const entry of toWrite) {
    batch.set(userCol('WatchLog').doc(), entry);
    pending++; written++;
    if (pending === 450) { await batch.commit(); batch = db.batch(); pending = 0; }
}
if (pending > 0) await batch.commit();

console.log(`✅ Backfill completado: ${written} entradas creadas en el diario.\n`);
process.exit(0);
