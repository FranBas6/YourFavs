/**
 * Variables de Supabase, todas de SERVIDOR (sin `PUBLIC_`): el navegador no habla con Supabase.
 *
 * `import.meta.env` en local (Vite lee `.env`) y
 * `process.env` en Netlify, donde las variables del panel llegan en tiempo de ejecución.
 * Falla con un mensaje claro en vez de con un `undefined` en mitad de una consulta.
 */
function read(name: 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY'): string {
    const value = import.meta.env[name] || process.env[name];
    if (!value) {
        throw new Error(`[supabase] Falta ${name}. En local: \`npm run db:status\` te da los valores para .env.`);
    }
    return value;
}

export function supabaseEnv() {
    return { url: read('SUPABASE_URL'), publishableKey: read('SUPABASE_PUBLISHABLE_KEY') };
}

export function supabaseSecretKey(): string {
    return read('SUPABASE_SECRET_KEY');
}
