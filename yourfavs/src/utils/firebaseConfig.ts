import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
    apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
    measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validar que las variables de entorno existen
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    const missingVars = [];
    if (!firebaseConfig.apiKey) missingVars.push("PUBLIC_FIREBASE_API_KEY");
    if (!firebaseConfig.authDomain) missingVars.push("PUBLIC_FIREBASE_AUTH_DOMAIN");
    if (!firebaseConfig.projectId) missingVars.push("PUBLIC_FIREBASE_PROJECT_ID");
    
    console.error("⚠️ Variables de Firebase faltantes:", missingVars.join(", "));
    console.error("⚠️ Verifica que estén configuradas en Netlify: Site settings → Environment variables");
    
    throw new Error(
        `Firebase configuration is missing: ${missingVars.join(", ")}. ` +
        `Please check your environment variables in Netlify dashboard.`
    );
}

console.log("✅ Firebase config cargada:", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
});

// Inicializar Firebase solo una vez
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Inicializar Firestore
export const db = getFirestore(app);

console.log("✅ Firebase inicializado correctamente");