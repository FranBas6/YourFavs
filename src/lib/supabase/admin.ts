/**
 * Cliente de Supabase con la clave SECRETA: se salta la RLS.
 *
 * Solo para lo que no pertenece a un usuario o lo que un usuario no puede hacerse a sí mismo:
 * borrar su cuenta de Auth, y (Fase 4) las filas globales de la portada. Todo lo demás va con
 * el cliente de la petición (`server.ts`), donde manda la RLS. Nunca debe llegar al navegador.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabaseEnv, supabaseSecretKey } from './env';

let admin: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
    if (!admin) {
        admin = createClient<Database>(supabaseEnv().url, supabaseSecretKey(), {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return admin;
}
