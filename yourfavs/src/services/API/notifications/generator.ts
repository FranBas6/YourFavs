/**
 * Generador de notificaciones (Bloque 4) — "materializar al abrir".
 *
 * Lee las señales que YA tenemos (radar: episodios/plataformas/personas + efeméride
 * del brief) y hace upsert idempotente en users/{uid}/notifications con id
 * determinista. No requiere cron. Respeta los toggles del perfil (por defecto, todo
 * activado). Guardado por uid+día en memoria: solo materializa una vez al día por
 * instancia (el radar ya está cacheado por día; esto evita el fetch de la efeméride
 * en cada carga de página del badge).
 *
 * El "cambio de plataforma" (entró/salió) también es on-open: NO usa cron. Compara el
 * estado de HOY contra un snapshot por usuario (providerState) y materializa solo los
 * cambios. Ver platformChangeItems() más abajo.
 */
import { getRadar } from '../shared/radar';
import { anniversarySignal, getPendientesOnMyPlatforms } from '../shared/dailyBrief';
import { upsertMany, type NotifInput, type NotifType } from '../../BD/notifications/notifications';
import { getCurrentUid } from '../../BD/shared/userScope';
import { getUserProfile } from '../../BD/profile/userProfile';
import { getLibrarySnapshot } from '../../BD/shared/librarySnapshot';
import { readProviderState, writeProviderState, type ProviderSnapEntry } from '../../BD/notifications/providerState';
import { appDateParts } from '../../../utils/appTime';

// type de notificación → clave del toggle en el perfil (UserProfile.notifPrefs)
const TYPE_TO_PREF: Record<NotifType, string> = {
    new_episode: 'episodes',
    on_platform: 'platform',
    person_release: 'releases',
    anniversary: 'anniversary',
    platform_change: 'platform',
};

// Firestore no admite '/' en el id de documento.
function safeId(s: string): string {
    return s.replace(/\//g, ':');
}

const syncedDay = new Map<string, string>(); // uid → "YYYY-MM-DD" ya materializado

export async function syncNotifications(platforms: number[] = [], force = false): Promise<void> {
    const uid = getCurrentUid();
    if (!uid) return;
    const day = appDateParts(Date.now()).key;
    if (!force && syncedDay.get(uid) === day) return;

    // Preferencias por tipo (si no hay, todo activado).
    let prefs: Record<string, boolean> | null = null;
    try {
        const p = await getUserProfile();
        prefs = (p as any)?.notifPrefs ?? null;
    } catch { /* sin perfil → todo activado */ }
    const enabled = (type: NotifType) => !prefs || prefs[TYPE_TO_PREF[type]] !== false;

    const items: NotifInput[] = [];

    try {
        const radar = await getRadar(platforms);
        for (const g of radar.groups) {
            for (const it of g.items) {
                if (g.key === 'episodes' && enabled('new_episode')) {
                    const epTag = it.meta.split(' · ')[0]; // "T2·E55" (estable por episodio)
                    items.push({
                        id: safeId(`episode:${it.tmdb_id}:${epTag}`),
                        type: 'new_episode', title: it.title, subtitle: it.meta,
                        href: it.href, poster_path: it.poster_path,
                    });
                // NB: el grupo 'platforms' (pendientes ya streameables) NO se materializa
                // desde el radar: sin diff volcaría toda la watchlist. Lo cubre
                // platformChangeItems() abajo, que solo emite los que ENTRARON/SALIERON.
                } else if (g.key === 'people' && enabled('person_release')) {
                    items.push({
                        id: safeId(`release:${it.media_type}:${it.tmdb_id}`),
                        type: 'person_release', title: it.title, subtitle: it.meta,
                        href: it.href, poster_path: it.poster_path,
                    });
                }
            }
        }
    } catch (error) {
        console.error('[notifications] radar:', (error as Error).message);
    }

    if (enabled('anniversary')) {
        try {
            const a = await anniversarySignal();
            if (a) {
                const year = appDateParts(Date.now()).key.slice(0, 4);
                const hrefKey = a.href.replace(/^\//, '').replace(/\//g, ':'); // "movie:789"
                items.push({
                    id: safeId(`anniv:${hrefKey}:${year}`),
                    type: 'anniversary', title: a.title, subtitle: a.subtitle,
                    href: a.href, poster_path: a.poster_path ?? null,
                });
            }
        } catch (error) {
            console.error('[notifications] anniversary:', (error as Error).message);
        }
    }

    // Cambió de plataforma (entró/salió) — diff contra el snapshot del usuario.
    if (enabled('platform_change')) {
        try {
            items.push(...await platformChangeItems(platforms, day));
        } catch (error) {
            console.error('[notifications] platform_change:', (error as Error).message);
        }
    }

    try {
        await upsertMany(items);
        syncedDay.set(uid, day);
    } catch (error) {
        console.error('[notifications] upsert:', (error as Error).message);
    }
}

/**
 * "Cambió de plataforma" (entró/salió), sin cron. Compara los pendientes que HOY están
 * en flatrate de tus plataformas contra el último snapshot guardado y emite solo los
 * cambios; luego reescribe el snapshot.
 *
 * · 1ª sincronización (sin snapshot) → SIEMBRA en silencio (nada de volcar la watchlist).
 * · Ya procesado hoy (snapshot.day === day) → no re-diffea (idempotente entre instancias).
 * · "Salió" solo se emite si el título SIGUE en Pendientes (evita el falso positivo de
 *   que lo hayas quitado tú de Pendientes o ya lo hayas visto).
 * · Sin plataformas seleccionadas → función desactivada (no toca el snapshot).
 */
async function platformChangeItems(platforms: number[], day: string): Promise<NotifInput[]> {
    if (!platforms.length) return [];

    const onPlatform = await getPendientesOnMyPlatforms(platforms);
    const hoy: Record<string, ProviderSnapEntry> = {};
    for (const p of onPlatform) {
        hoy[`${p.media_type}:${p.id}`] = {
            name: p.provider_name, title: p.title, poster: p.poster_path, media_type: p.media_type,
        };
    }

    const prev = await readProviderState();

    // Primera vez → sembrar sin notificar. Ya diffeado hoy → nada que hacer.
    if (!prev) { await writeProviderState({ day, map: hoy }); return []; }
    if (prev.day === day) return [];

    const items: NotifInput[] = [];
    const hrefFor = (e: ProviderSnapEntry, id: string) =>
        e.media_type === 'movie' ? `/movie/${id}` : `/serie/${id}`;

    // ENTRÓ: está en hoy y no estaba en el snapshot previo.
    for (const [key, e] of Object.entries(hoy)) {
        if (key in prev.map) continue;
        const id = key.split(':')[1];
        items.push({
            id: safeId(`platform:in:${key}:${day}`),
            type: 'platform_change',
            title: e.title,
            subtitle: `Ya en ${e.name} · de tu lista`,
            href: hrefFor(e, id),
            poster_path: e.poster,
        });
    }

    // SALIÓ: estaba en el snapshot previo, ya no está en hoy, PERO sigue en tu watchlist
    // (Pendientes o Ver pronto). Si ya no está en ninguna, lo quitaste tú → no es "salió".
    const leftKeys = Object.keys(prev.map).filter((k) => !(k in hoy));
    if (leftKeys.length) {
        let stillPend: Set<string>;
        try {
            const snap = await getLibrarySnapshot();
            stillPend = new Set<string>();
            for (const m of [...((snap as any).movPend || []), ...((snap as any).movVerPronto || [])]) stillPend.add(`movie:${m.id}`);
            for (const s of [...((snap as any).tvPend || []), ...((snap as any).tvVerPronto || [])]) stillPend.add(`tv:${s.id}`);
        } catch {
            stillPend = new Set(leftKeys); // si falla la lectura, no filtramos (conservador)
        }
        for (const key of leftKeys) {
            if (!stillPend.has(key)) continue; // ya no está en tu watchlist → no es "salió"
            const e = prev.map[key];
            const id = key.split(':')[1];
            items.push({
                id: safeId(`platform:out:${key}:${day}`),
                type: 'platform_change',
                title: e.title,
                subtitle: `Salió de ${e.name} · aún en tu lista`,
                href: hrefFor(e, id),
                poster_path: e.poster,
            });
        }
    }

    await writeProviderState({ day, map: hoy });
    return items;
}

export function invalidateNotifSync(uid?: string) {
    if (uid) syncedDay.delete(uid); else syncedDay.clear();
}
