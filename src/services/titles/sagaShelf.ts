import { processBatch } from "../../utils/core/processBatch";
import type { MovieCollectionInfo } from "../movies/movieDetail";
import { getWatchedMovieTiers, type WatchedTier } from "../movies/movieLibrary";
import { getLibrarySnapshot } from "../library/librarySnapshot";
import { getUserCollections } from "./collectionsDiscovery";
import { getFollowedCollections } from "./followedCollections";
import { getSagaDetail } from "./sagaDetail";

/**
 * Mis listas › Sagas (2026-11-23, C3.6; handoff docs/Sagas/design_handoff_sagas, S5).
 *
 *  - «Sagas que sigues»: con el detalle de cada saga (`getSagaDetail`, caché de 1 h compartida con su
 *    página y sus fichas) para la duración de la siguiente, el estado y la fecha de la próxima y el
 *    maratón. Orden: 1) con una próxima con fecha (la más cercana antes); 2) a medias (la última que
 *    viste más reciente antes); 3) el resto, en el orden en que las seguiste.
 *  - «Para seguir»: las sagas que tocan tus listas y no sigues, con los datos ligeros de la saga (sin
 *    llamadas por película). A medias primero (más vistas antes), luego sin empezar y las completas al
 *    final; fuera las de una sola estrenada y ninguna próxima. Máx. 6.
 */

export interface SagaBarItem { tier: WatchedTier | null; upcoming: boolean }

interface SagaCardBase {
    id: number;
    name: string;
    /** Fondo 16:9 de la saga; sin él, la tarjeta pinta un mosaico con `posters`. */
    backdrop: string | null;
    posters: string[];
    total: number;
    released: number;
    seen: number;
    upcomingCount: number;
    /** «4 películas · 2020–». */
    meta: string;
    bar: SagaBarItem[];
}

export interface SagaFollowCard extends SagaCardBase {
    /** La siguiente que te toca (estrenada y sin ver). */
    next: { id: number; title: string; runtime: number | null } | null;
    /** La próxima por estrenar: fecha en tu país si la hay (si no, la mundial; null = por anunciar). */
    upcoming: { id: number; title: string; date: string | null; statusLabel: string | null } | null;
    complete: boolean;
    marathonMin: number;
}

export interface SagaSuggestCard extends SagaCardBase {
    missing: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function metaOf(total: number, years: number[], hasUpcoming: boolean): string {
    const first = years.length ? Math.min(...years) : null;
    const last = years.length ? Math.max(...years) : null;
    const span = first == null ? '' : hasUpcoming ? `${first}–` : last !== first ? `${first}–${last}` : String(first);
    return [`${total} ${total === 1 ? 'película' : 'películas'}`, span].filter(Boolean).join(' · ');
}

function sortedParts<T extends { release_date: string | null }>(parts: T[]): T[] {
    return [...parts].sort((a, b) => {
        if (!a.release_date) return 1;
        if (!b.release_date) return -1;
        return a.release_date.localeCompare(b.release_date);
    });
}

const halfway = (s: SagaCardBase) => s.seen > 0 && s.seen < s.released;

/** Tarjetas de las sagas que sigues, ya ordenadas. */
async function followCards(tiers: Map<number, WatchedTier>, lastSeen: Map<number, number>): Promise<SagaFollowCard[]> {
    const followed = await getFollowedCollections();
    const details = await processBatch(followed.map((f) => f.id), (id: number) => getSagaDetail(id).catch(() => null), 3);

    const cards = followed.map((f, i): SagaFollowCard & { activity: number; order: number } => {
        const d = details[i];
        if (!d) {
            // TMDB no responde: la tarjeta sale igual con lo guardado al seguirla.
            return {
                id: f.id, name: f.name, backdrop: f.backdrop_path, posters: f.poster_path ? [f.poster_path] : [],
                total: 0, released: 0, seen: 0, upcomingCount: 0, meta: '', bar: [],
                next: null, upcoming: null, complete: false, marathonMin: 0, activity: 0, order: i,
            };
        }
        const released = d.parts.filter((p) => p.released);
        const seen = released.filter((p) => tiers.has(p.id)).length;
        const nextPart = released.find((p) => !tiers.has(p.id)) ?? null;
        const upPart = d.parts.find((p) => !p.released) ?? null;
        const upDate = upPart ? (upPart.localRelease.cinema || upPart.localRelease.digital || upPart.release_date || null) : null;
        const years = d.parts.map((p) => Number(p.release_date?.slice(0, 4))).filter((y) => y > 0);
        return {
            id: d.info.id,
            name: d.info.name,
            backdrop: d.info.backdrop_path,
            posters: d.parts.map((p) => p.poster_path).filter(Boolean).slice(0, 3) as string[],
            total: d.parts.length,
            released: released.length,
            seen,
            upcomingCount: d.parts.length - released.length,
            meta: metaOf(d.parts.length, years, !!upPart),
            bar: d.parts.map((p) => ({ tier: tiers.get(p.id) ?? null, upcoming: !p.released })),
            next: nextPart ? { id: nextPart.id, title: nextPart.title, runtime: nextPart.runtime } : null,
            upcoming: upPart ? { id: upPart.id, title: upPart.title, date: upDate, statusLabel: upPart.statusLabel } : null,
            complete: released.length > 0 && seen === released.length,
            marathonMin: d.marathonMin,
            activity: Math.max(0, ...released.map((p) => lastSeen.get(p.id) ?? 0)),
            order: i,
        };
    });

    const rank = (s: SagaFollowCard) => (s.upcoming?.date ? 0 : halfway(s) ? 1 : 2);
    cards.sort((a, b) => rank(a) - rank(b)
        || (rank(a) === 0 ? a.upcoming!.date!.localeCompare(b.upcoming!.date!) : 0)
        || (rank(a) === 1 ? b.activity - a.activity : 0)
        || a.order - b.order);
    return cards.map(({ activity: _a, order: _o, ...c }) => c);
}

function suggestCard(c: MovieCollectionInfo, tiers: Map<number, WatchedTier>): SagaSuggestCard {
    const today = todayISO();
    const parts = sortedParts(c.parts);
    const isRel = (p: { release_date: string | null }) => !!p.release_date && p.release_date <= today;
    const released = parts.filter(isRel);
    const seen = released.filter((p) => tiers.has(p.id)).length;
    const upcomingCount = parts.length - released.length;
    const years = parts.map((p) => Number(p.release_date?.slice(0, 4))).filter((y) => y > 0);
    return {
        id: c.id, name: c.name, backdrop: c.backdrop_path,
        posters: parts.map((p) => p.poster_path).filter(Boolean).slice(0, 3) as string[],
        total: parts.length, released: released.length, seen, upcomingCount,
        meta: metaOf(parts.length, years, upcomingCount > 0),
        bar: parts.map((p) => ({ tier: tiers.get(p.id) ?? null, upcoming: !isRel(p) })),
        missing: released.length - seen,
    };
}

export async function getSagaShelf(): Promise<{ following: SagaFollowCard[]; suggested: SagaSuggestCard[] }> {
    const [tiers, snap, mine] = await Promise.all([
        getWatchedMovieTiers().catch(() => new Map<number, WatchedTier>()),
        getLibrarySnapshot().catch(() => null),
        getUserCollections().catch(() => [] as MovieCollectionInfo[]),
    ]);
    // Cuándo viste por última vez cada película (lo más reciente de Vistas, Me gusta y Favoritos).
    const lastSeen = new Map<number, number>();
    for (const m of [...(snap?.movVistos ?? []), ...(snap?.movLike ?? []), ...(snap?.movFavs ?? [])]) {
        const ts = Date.parse((m as any).added_at) || 0;
        const id = Number(m.id);
        if (ts > (lastSeen.get(id) ?? 0)) lastSeen.set(id, ts);
    }

    const following = await followCards(tiers, lastSeen);
    const followedIds = new Set(following.map((f) => f.id));

    const srank = (s: SagaSuggestCard) => (halfway(s) ? 0 : s.seen === 0 ? 1 : 2);
    const suggested = mine
        .filter((c) => !followedIds.has(c.id))
        .map((c) => suggestCard(c, tiers))
        .filter((s) => s.released > 1 || s.upcomingCount > 0)
        .sort((a, b) => srank(a) - srank(b) || (srank(a) === 0 ? b.seen - a.seen : 0))
        .slice(0, 6);

    return { following, suggested };
}
