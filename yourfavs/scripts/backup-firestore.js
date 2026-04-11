import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Credenciales de Firebase (las mismas que usa la app)
const firebaseConfig = {
    apiKey: "AIzaSyBgSBLbdNMNnAwX94CJhccGWHzunl6519E",
    authDomain: "yourfavsbd.firebaseapp.com",
    projectId: "yourfavsbd",
    storageBucket: "yourfavsbd.firebasestorage.app",
    messagingSenderId: "68077586193",
    appId: "1:68077586193:web:411867f86654e4a758aeb0",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Las 13 colecciones
const COLLECTIONS = [
    "MovieFavs", "MoviesPendientes", "MoviesVistas", "MoviesVerPronto", "LikedMovies",
    "SeriesFavs", "SeriesPendiente", "SeriesVistas", "SeriesSiguiendo", "SeriesVerPronto", "LikedSeries",
    "ActorsFavs",
];

async function backup() {
    const date = new Date().toISOString().split("T")[0];
    const backupDir = resolve(__dirname, "backups", date);
    mkdirSync(backupDir, { recursive: true });

    console.log(`\n📦 Backup de Firestore — ${date}\n`);

    let totalDocs = 0;

    for (const colName of COLLECTIONS) {
        const snapshot = await getDocs(collection(db, colName));
        const documents = [];

        snapshot.forEach((doc) => {
            documents.push({ docId: doc.id, ...doc.data() });
        });

        const filePath = resolve(backupDir, `${colName}.json`);
        writeFileSync(filePath, JSON.stringify({ collection: colName, count: documents.length, documents }, null, 2));

        console.log(`  ✅ ${colName}: ${documents.length} documentos`);
        totalDocs += documents.length;
    }

    console.log(`\n📊 Total: ${totalDocs} documentos en ${COLLECTIONS.length} colecciones`);
    console.log(`📁 Guardado en: ${backupDir}\n`);

    process.exit(0);
}

backup().catch((error) => {
    console.error("❌ Error en el backup:", error);
    process.exit(1);
});
