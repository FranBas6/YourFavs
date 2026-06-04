/// <reference path="../.astro/types.d.ts" />

interface SessionUser {
    uid: string;
    email: string | null;
    name: string | null;
    picture: string | null;
}

declare namespace App {
    interface Locals {
        /** Usuario de la sesión verificada por el middleware; null si es invitado. */
        user: SessionUser | null;
    }
}

interface ImportMetaEnv {
    // Cliente (públicas)
    readonly PUBLIC_FIREBASE_API_KEY: string;
    readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    readonly PUBLIC_FIREBASE_PROJECT_ID: string;
    readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
    readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly PUBLIC_FIREBASE_APP_ID: string;
    readonly PUBLIC_FIREBASE_MEASUREMENT_ID: string;
    // Servidor (privadas)
    readonly TMDB_API_KEY: string;
    readonly FIREBASE_ADMIN_KEY_B64: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
