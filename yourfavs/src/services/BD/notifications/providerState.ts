/**
 * Snapshot de disponibilidad en plataformas (para "cambió de plataforma").
 *
 * Guarda, por usuario, qué pendientes estaban en flatrate de TUS plataformas la
 * última vez que se sincronizó la campana (una fila de `user_state`, clave
 * 'notif_provider_state' → lectura + escritura mínima). El generador compara el estado de HOY
 * contra este snapshot para detectar qué ENTRÓ y qué SALIÓ, y luego lo reescribe.
 *
 * NO necesita cron: se materializa al abrir, igual que el resto de la campana. La
 * semántica es la correcta para un buzón pull: "qué cambió desde la última vez que
 * miraste". El diff solo tiene sentido con memoria del estado anterior; esa memoria
 * es esta fila.
 */
import { readUserState, writeUserState } from '../shared/userState';

export interface ProviderSnapEntry {
    name: string;                   // nombre del proveedor (p.ej. "Netflix")
    title: string;                  // título (permite pintar "salió" sin fetch extra)
    poster: string | null;          // póster
    media_type: 'movie' | 'tv';
    origin?: 'watchlist' | 'fav' | 'like';  // de qué lista viene (copy de "salió"); ausente = watchlist (snapshots antiguos)
}

export interface ProviderState {
    version?: number;                               // conjunto de listas vigiladas; si cambia → re-siembra en silencio
    day: string;                                    // "YYYY-MM-DD" (Madrid) en que se capturó
    map: Record<string, ProviderSnapEntry>;         // key "movie:123" → entrada
}

export async function readProviderState(): Promise<ProviderState | null> {
    try {
        const d = await readUserState<any>('notif_provider_state');
        if (!d) return null;
        return { version: d?.version, day: d?.day || '', map: d?.map || {} };
    } catch {
        return null;
    }
}

export async function writeProviderState(state: ProviderState): Promise<void> {
    await writeUserState('notif_provider_state', state);
}
