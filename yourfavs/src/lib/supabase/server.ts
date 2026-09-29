/**
 * Cliente de Supabase por petición (SSR) — sustituye al Admin SDK de Firebase para la sesión.
 *
 * TODO el flujo de auth pasa por el servidor (API routes de `src/pages/api/auth/`), igual que
 * antes con la cookie de sesión de Firebase: el navegador nunca carga una librería de auth ni
 * ve un token. Por eso las cookies de Supabase se fuerzan `httpOnly` aquí (por defecto
 * `@supabase/ssr` las deja legibles por JS, pensando en apps que también hacen login en cliente).
 *
 * Una instancia por petición: lleva dentro las cookies de ESA petición, y la RLS de Postgres
 * decide con el usuario de ese token qué filas se ven.
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';
import { supabaseEnv } from './env';

export type SupabaseServer = ReturnType<typeof createSupabaseServerClient>;

export function createSupabaseServerClient(ctx: { request: Request; cookies: AstroCookies }) {
    const { url, publishableKey } = supabaseEnv();
    return createServerClient<Database>(url, publishableKey, {
        cookies: {
            getAll() {
                return parseCookieHeader(ctx.request.headers.get('Cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' }));
            },
            setAll(cookiesToSet) {
                for (const { name, value, options } of cookiesToSet) {
                    try {
                        ctx.cookies.set(name, value, {
                            ...options,
                            httpOnly: true,
                            secure: import.meta.env.PROD,
                            sameSite: 'lax',
                            path: '/',
                        });
                    } catch {
                        // Ya se envió la respuesta (p. ej. un refresco tardío a mitad de render).
                        // El middleware refresca la sesión ANTES de renderizar, así que aquí no
                        // se pierde nada: el siguiente request volverá a tener el token bueno.
                    }
                }
            },
        },
    });
}
