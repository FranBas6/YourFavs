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
 * El "cambio de plataforma" (entró/salió) queda FUERA: necesita snapshot diario +
 * proceso programado. Entrará como un tipo más cuando se monte el cron.
 */
import { getRadar } from '../shared/radar';
import { anniversarySignal } from '../shared/dailyBrief';
import { upsertMany, type NotifInput, type NotifType } from '../../BD/notifications/notifications';
import { getCurrentUid } from '../../BD/shared/userScope';
import { getUserProfile } from '../../BD/profile/userProfile';
import { appDateParts } from '../../../utils/appTime';

// type de notificación → clave del toggle en el perfil (UserProfile.notifPrefs)
const TYPE_TO_PREF: Record<NotifType, string> = {
    new_episode: 'episodes',
    on_platform: 'platform',
    person_release: 'releases',
    anniversary: 'anniversary',
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
                // NB: el grupo 'platforms' (pendientes ya streameables) NO se materializa:
                // sin detección de cambios volcaría toda la watchlist. Vive en el Radar y
                // volverá como "cambió de plataforma" cuando exista el cron.
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

    try {
        await upsertMany(items);
        syncedDay.set(uid, day);
    } catch (error) {
        console.error('[notifications] upsert:', (error as Error).message);
    }
}

export function invalidateNotifSync(uid?: string) {
    if (uid) syncedDay.delete(uid); else syncedDay.clear();
}
