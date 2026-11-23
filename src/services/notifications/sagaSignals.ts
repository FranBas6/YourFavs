/**
 * Avisos de las sagas que sigues (C3.7, 2026-11-23; handoff docs/Sagas/design_handoff_sagas, «Seguir
 * saga»). Tres, en la campana (sin email), con el interruptor «Sagas que sigues» de Ajustes:
 *
 *   · Película nueva en la saga   TMDB añade una película sin estrenar        «Nueva en la saga Dune · …»
 *   · Ya tiene fecha              una próxima que estaba «por anunciar»      «Ya tiene fecha · 18 dic 2026 · cines en España»
 *   · Se estrena en España        el día del estreno en tu país (cines o      «Se estrena hoy en cines»
 *                                 digital), hasta 2 días después
 *
 * Memoria (`user_state` 'notif_saga_state'): por saga, qué películas tenía y con qué fecha la última vez.
 * Una saga que acabas de seguir se siembra en silencio (no avisa de lo que ya estaba); el estreno sí,
 * porque no depende de la memoria y su id es fijo (llega una vez). Lo de antes de seguirla no avisa.
 *
 * Datos: `getSagaDetail` (caché de 1 h, la misma de la página y las fichas). La campana se materializa
 * una vez al día por usuario (generator.ts), así que esto corre como mucho una vez al día.
 */
import { processBatch } from '../../utils/core/processBatch';
import { appDateParts } from '../../utils/core/appTime';
import { shortDate } from '../../utils/titles/sagaView';
import { readUserState, writeUserState } from '../db/userState';
import { getFollowedCollections } from '../titles/followedCollections';
import { getSagaDetail, type SagaPart } from '../titles/sagaDetail';
import type { NotifInput } from './notifications';

const STATE_KEY = 'notif_saga_state';
/** Por saga: id de película → fecha conocida (la de tu país si la hay; null = por anunciar). */
interface SagaState { version: 1; map: Record<string, Record<string, string | null>> }

/** Días después del estreno en que el aviso todavía tiene sentido (por si no abres la web ese día). */
const PREMIERE_GRACE_DAYS = 2;

async function readState(): Promise<SagaState | null> {
    try {
        const d = await readUserState<SagaState>(STATE_KEY);
        return d?.version === 1 && d.map ? d : null;
    } catch {
        return null;
    }
}

/** La fecha que importa: estreno en tu país (cines, si no digital) y, si no hay, la mundial. */
const knownDate = (p: SagaPart) => p.localRelease.cinema || p.localRelease.digital || p.release_date || null;

/** «18 dic 2026 · cines en España», «18 dic 2026» o el estado («En producción»). */
function whenText(p: SagaPart, country: string): string {
    if (p.localRelease.cinema) return `${shortDate(p.localRelease.cinema)} · cines en ${country}`;
    if (p.localRelease.digital) return `${shortDate(p.localRelease.digital)} · digital en ${country}`;
    if (p.release_date) return shortDate(p.release_date);
    return p.statusLabel ? `${p.statusLabel} · sin fecha` : 'sin fecha';
}

/** Los avisos guardan la ruta de TMDB del póster («/abc.jpg»), no la URL. */
const posterPath = (url: string | null) => (url ? url.replace(/^https?:\/\/[^/]+\/t\/p\/[^/]+/, '') : null);

export async function sagaSignals(): Promise<NotifInput[]> {
    const followed = await getFollowedCollections();
    const prev = await readState();
    if (followed.length === 0) {
        if (prev && Object.keys(prev.map).length) await writeUserState(STATE_KEY, { version: 1, map: {} }).catch(() => {});
        return [];
    }

    const details = await processBatch(followed.map((f) => f.id), (id: number) => getSagaDetail(id).catch(() => null), 3);
    const today = appDateParts(Date.now()).dayNum;
    const dayNum = (iso: string) => appDateParts(new Date(iso.slice(0, 10) + 'T12:00:00Z').getTime()).dayNum;

    const items: NotifInput[] = [];
    const next: SagaState = { version: 1, map: {} };

    followed.forEach((f, i) => {
        const key = String(f.id);
        const d = details[i];
        // TMDB no respondió: se conserva lo que había para no avisar de todo mañana.
        if (!d) {
            if (prev?.map[key]) next.map[key] = prev.map[key];
            return;
        }
        const old = prev?.map[key];
        const country = (() => { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(d.region) ?? d.region; } catch { return d.region; } })();
        const entry: Record<string, string | null> = {};

        for (const p of d.parts) {
            const date = knownDate(p);
            entry[String(p.id)] = date;
            const base = { title: p.title, href: `/movie/${p.id}`, poster_path: posterPath(p.poster_path) };

            if (old && !p.released) {
                if (!(String(p.id) in old)) {
                    items.push({ ...base, id: `saga:new:${f.id}:${p.id}`, type: 'saga_update', subtitle: `Nueva en la saga ${d.info.name} · ${whenText(p, country)}` });
                } else if (old[String(p.id)] == null && date) {
                    items.push({ ...base, id: `saga:date:${f.id}:${p.id}`, type: 'saga_update', subtitle: `Ya tiene fecha · ${whenText(p, country)}` });
                }
            }

            // El día del estreno en tu país (o hasta 2 días después).
            const local = p.localRelease.cinema || p.localRelease.digital;
            if (local) {
                const diff = today - dayNum(local);
                if (diff >= 0 && diff <= PREMIERE_GRACE_DAYS) {
                    const how = p.localRelease.cinema ? 'en cines' : 'en digital';
                    const when = diff === 0 ? 'se estrena hoy' : diff === 1 ? 'se estrenó ayer' : 'se estrenó hace 2 días';
                    items.push({ ...base, id: `saga:premiere:${f.id}:${p.id}`, type: 'saga_update', subtitle: `${d.info.name} · ${when} ${how} en ${country}` });
                }
            }
        }
        next.map[key] = entry;
    });

    if (JSON.stringify(next.map) !== JSON.stringify(prev?.map ?? {})) {
        await writeUserState(STATE_KEY, next).catch(() => {});
    }
    return items;
}
