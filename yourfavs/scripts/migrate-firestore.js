import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

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

// Colecciones y qué campos conservar
const COLLECTIONS = {
    // Movies: solo id, added_at, opinion?
    MovieFavs:          { keepPosition: false },
    MoviesPendientes:   { keepPosition: false },
    MoviesVistas:       { keepPosition: false },
    MoviesVerPronto:    { keepPosition: false },
    LikedMovies:        { keepPosition: false },
    // Series: solo id, added_at, opinion? (SeriesFavs también position)
    SeriesFavs:         { keepPosition: true },
    SeriesPendiente:    { keepPosition: false },
    SeriesVistas:       { keepPosition: false },
    SeriesSiguiendo:    { keepPosition: false },
    SeriesVerPronto:    { keepPosition: false },
    LikedSeries:        { keepPosition: false },
    // Actors: id, added_at, position
    ActorsFavs:         { keepPosition: true },
};

async function migrate() {
    console.log("\n🔄 Migración de Firestore — Simplificando documentos\n");

    let totalMigrated = 0;

    for (const [colName, config] of Object.entries(COLLECTIONS)) {
        const snapshot = await getDocs(collection(db, colName));

        if (snapshot.empty) {
            console.log(`  ⏭️  ${colName}: vacía, saltando`);
            continue;
        }

        let count = 0;
        const total = snapshot.size;

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            // Construir nuevo documento con solo los campos necesarios
            const newData = {
                id: data.id || docSnap.id,
                added_at: data.added_at || new Date(),
            };

            // Conservar opinion si existe
            if (data.opinion) {
                newData.opinion = data.opinion;
            }

            // Conservar position si aplica
            if (config.keepPosition && data.position !== undefined) {
                newData.position = data.position;
            }

            // Sobreescribir el documento completo (elimina campos no incluidos)
            await setDoc(doc(db, colName, docSnap.id), newData);
            count++;
        }

        console.log(`  ✅ ${colName}: ${count}/${total} documentos migrados`);
        totalMigrated += count;
    }

    console.log(`\n📊 Total: ${totalMigrated} documentos migrados`);
    console.log("✅ Migración completada\n");

    process.exit(0);
}

migrate().catch((error) => {
    console.error("❌ Error en la migración:", error);
    process.exit(1);
});
