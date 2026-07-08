/**
 * Migración ligera: modelo de estados de 2 capas (handoff design_handoff_estados).
 *
 * En el modelo nuevo "Visto" es el paraguas "consumido": marcar Favorito o Me gusta
 * IMPLICA visto. Los datos antiguos tienen favs/likes que NO están en Vistas. Este
 * script los alinea: por cada título en {MovieFavs, LikedMovies} / {SeriesFavs,
 * LikedSeries} que no esté en {MoviesVistas} / {SeriesVistas}, crea la entrada en
 * Vistas copiando `id`/`opinion`/`rating` y REUSANDO su `added_at` (no lo toca — la
 * fecha de consumo real es la de la opinión, no "hoy").
 *
 * IDEMPOTENTE: si ya está en Vistas, no hace nada. Correrlo dos veces no duplica.
 *
 *   node scripts/migrate-estados.mjs <uid> [--dry-run]
 *   node scripts/migrate-estados.mjs --all [--dry-run]
 *
 * --dry-run: solo cuenta, no escribe. Usa la service account de FIREBASE_ADMIN_KEY_B64 (.env).
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const uidArg = args.find((a) => !a.startsWith('--'));

if (!uidArg && !all) {
    console.error('Uso: node scripts/migrate-estados.mjs <uid> [--dry-run]  |  --all [--dry-run]');
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

// Opinión (origen) → lista Vistas (destino) por tipo.
const PLANS = [
    { label: 'pelis',  opinion: ['MovieFavs', 'LikedMovies'],   vistas: 'MoviesVistas' },
    { label: 'series', opinion: ['SeriesFavs', 'LikedSeries'],  vistas: 'SeriesVistas' },
];

/** Copia solo los campos que aportan valor a la entrada de Vistas (sin position). */
function pickEntry(id, data) {
    const out = { id };
    out.added_at = data?.added_at ?? new Date();
    if (data?.opinion) out.opinion = data.opinion;
    if (typeof data?.rating === 'number') out.rating = data.rating;
    return out;
}

async function migrateUser(uid) {
    const userCol = (name) => db.collection('users').doc(uid).collection(name);
    let created = 0;

    for (const plan of PLANS) {
        // Ids ya presentes en Vistas → no duplicar.
        const vistasSnap = await userCol(plan.vistas).get();
        const inVistas = new Set(vistasSnap.docs.map((d) => d.id));

        // Recolecta candidatos de las listas de opinión (dedup, la primera gana).
        const candidates = new Map(); // id → data
        for (const col of plan.opinion) {
            const snap = await userCol(col).get();
            for (const d of snap.docs) {
                if (!candidates.has(d.id)) candidates.set(d.id, d.data());
            }
        }

        const toAdd = [...candidates].filter(([id]) => !inVistas.has(id));
        if (toAdd.length === 0) {
            console.log(`   [${uid}] ${plan.label}: 0 por migrar (Vistas: ${inVistas.size})`);
            continue;
        }

        if (dryRun) {
            console.log(`   [${uid}] ${plan.label}: ${toAdd.length} por añadir a ${plan.vistas} [DRY-RUN]`);
        } else {
            // Batches de ≤400 escrituras.
            for (let i = 0; i < toAdd.length; i += 400) {
                const batch = db.batch();
                for (const [id, data] of toAdd.slice(i, i + 400)) {
                    batch.set(userCol(plan.vistas).doc(id), pickEntry(id, data));
                }
                await batch.commit();
            }
            console.log(`   [${uid}] ${plan.label}: +${toAdd.length} en ${plan.vistas}`);
        }
        created += toAdd.length;
    }
    return created;
}

console.log(`\n🔀 Migración estados → Vistas (proyecto: ${sa.project_id})${dryRun ? '   [DRY-RUN — no escribe]' : ''}\n`);

let uids;
if (all) {
    const usersSnap = await db.collection('users').get();
    uids = usersSnap.docs.map((d) => d.id);
    console.log(`   ${uids.length} usuario(s)\n`);
} else {
    uids = [uidArg];
}

let total = 0;
for (const uid of uids) {
    total += await migrateUser(uid);
}

console.log(`\n✅ ${dryRun ? 'Se añadirían' : 'Añadidas'} ${total} entrada(s) a Vistas.\n`);
process.exit(0);
