/**
 * Clona TODO el árbol de un usuario sobre otro: users/{src}/… → users/{dst}/…
 *
 * "Que el usuario DST tenga las mismas cosas que el usuario SRC": copia el doc
 * raíz (perfil/preferencias) y TODAS las subcolecciones de forma RECURSIVA
 * (incluye las anidadas: items de cada customList y taste/current). No hace falta
 * enumerar colecciones a mano — se descubren con listCollections()/listDocuments(),
 * así no se queda ninguna fuera (Ratings, WatchLog, etc.).
 *
 * Usa el Admin SDK con la service account de FIREBASE_ADMIN_KEY_B64 (.env).
 * Igual que migrate-to-user.mjs: mismo comando sirve en dev y prod (cambia el
 * .env por la service account del proyecto de prod).
 *
 *   node scripts/clone-user.mjs [<srcUid> <dstUid>] [--dry-run] [--wipe-dest]
 *
 * Sin argumentos usa los UIDs por defecto de abajo.
 *   --dry-run    : solo cuenta y lista, no escribe nada (verificar antes).
 *   --wipe-dest  : borra el árbol de DST antes de copiar (resultado idéntico a SRC).
 *                  Sin este flag es ADITIVO: sobrescribe lo que coincide y respeta
 *                  lo que DST tenga de más.
 *
 * Idempotente en modo aditivo: copia con set() (sobrescribe), repetirlo es seguro.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// UIDs por defecto (los del encargo). Se pueden pasar por argumento.
const DEFAULT_SRC = '5eM7NiDsgyS2uBtzu0CNSSEALnG3';
const DEFAULT_DST = 'e5CJlTrLuwfQG6I7pyHyGMyoBuw2';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wipeDest = args.includes('--wipe-dest');
const positional = args.filter((a) => !a.startsWith('--'));
const srcUid = positional[0] || DEFAULT_SRC;
const dstUid = positional[1] || DEFAULT_DST;

if (srcUid === dstUid) {
    console.error('❌ SRC y DST son el mismo UID. Abortando.');
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

const srcRoot = db.collection('users').doc(srcUid);
const dstRoot = db.collection('users').doc(dstUid);

let docsCopied = 0;
let colsSeen = 0;

/** Copia recursiva de un DocumentReference a otro (datos + subcolecciones). */
async function copyDoc(srcRef, dstRef, depth, label) {
    const snap = await srcRef.get();
    if (snap.exists) {
        if (!dryRun) await dstRef.set(snap.data());
        docsCopied++;
    }
    const subCols = await srcRef.listCollections();
    for (const col of subCols) {
        await copyCollection(col, dstRef.collection(col.id), depth + 1, `${label}/${col.id}`);
    }
}

/** Copia todos los docs de una colección (en lotes) y recurre en cada uno. */
async function copyCollection(srcCol, dstCol, depth, label) {
    colsSeen++;
    const docs = await srcCol.listDocuments();
    const indent = '  '.repeat(depth);
    console.log(`${indent}${dryRun ? '•' : '✅'} ${label}: ${docs.length} docs`);

    // Datos de nivel: en lote para eficiencia (subcolecciones aparte, recursivas).
    let batch = db.batch();
    let pending = 0;
    for (const srcDocRef of docs) {
        const snap = await srcDocRef.get();
        const dstDocRef = dstCol.doc(srcDocRef.id);
        if (snap.exists) {
            if (!dryRun) { batch.set(dstDocRef, snap.data()); pending++; }
            docsCopied++;
        }
        if (pending === 450) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (!dryRun && pending > 0) await batch.commit();

    // Subcolecciones de cada doc (customLists/*/items, etc.).
    for (const srcDocRef of docs) {
        const subCols = await srcDocRef.listCollections();
        for (const sub of subCols) {
            await copyCollection(sub, dstCol.doc(srcDocRef.id).collection(sub.id), depth + 1, `${label}/${srcDocRef.id}/${sub.id}`);
        }
    }
}

function confirm(question) {
    if (dryRun) return Promise.resolve(true);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => rl.question(question, (a) => { rl.close(); res(/^s(i)?$/i.test(a.trim())); }));
}

console.log(`\n🧬 Clonar usuario   (proyecto: ${sa.project_id})${dryRun ? '   [DRY-RUN — no escribe]' : ''}`);
console.log(`   SRC: users/${srcUid}`);
console.log(`   DST: users/${dstUid}`);
console.log(`   Modo: ${wipeDest ? 'MIRROR (borra DST antes)' : 'aditivo (sobrescribe + conserva extras)'}\n`);

const ok = await confirm(`¿Confirmas copiar SRC → DST${wipeDest ? ' BORRANDO antes el árbol de DST' : ''}? (si/no) `);
if (!ok) { console.log('Cancelado.'); process.exit(0); }

if (wipeDest && !dryRun) {
    console.log(`\n🧹 Borrando árbol de DST (users/${dstUid})…`);
    await db.recursiveDelete(dstRoot);
    console.log('   Hecho.\n');
} else if (wipeDest && dryRun) {
    console.log(`\n🧹 [DRY-RUN] Se borraría el árbol de DST antes de copiar.\n`);
}

console.log('📂 Copiando…');
await copyDoc(srcRoot, dstRoot, 0, `users/${dstUid}`);

console.log(`\n📊 ${dryRun ? 'Se copiarían' : 'Copiados'} ${docsCopied} docs en ${colsSeen} colecciones.`);
console.log(dryRun ? '   (dry-run — nada escrito)\n' : `   DST ya tiene las mismas cosas que SRC.\n`);
process.exit(0);
