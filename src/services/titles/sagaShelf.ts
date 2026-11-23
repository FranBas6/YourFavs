import { processBatch } from "../../utils/core/processBatch";
import { getMovieCollectionInfo, type MovieCollectionInfo } from "../movies/movieDetail";
import { getWatchedMovieTiers, type WatchedTier } from "../movies/movieLibrary";
import { getUserCollections } from "./collectionsDiscovery";
import { getFollowedCollections } from "./followedCollections";

/**
 * Mis listas › Sagas (2026-11-23, C2): las sagas que sigues y, debajo, «Para seguir» (las que tocan tus
 * listas y no sigues). Cada tarjeta lleva el progreso, la siguiente que te toca (la primera estrenada sin
 * ver, por orden de estreno) y lo próximo que llega (la primera sin estrenar: con fecha o «por anunciar»).
 */
export interface SagaCard {
    id: number;
    name: string;
    backdrop: string | null;
    poster: string | null;
    total: number;
    released: number;
    seen: number;
    /** Siguiente que te toca (estrenada y sin ver). */
    next: { id: number; title: string } | null;
    /** Lo próximo (sin estrenar). `date` null = por anunciar. */
    upcoming: { id: number; title: string; date: string | null } | null;
    following: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function toCard(c: MovieCollectionInfo, tiers: Map<number, WatchedTier>, following: boolean): SagaCard {
    const today = todayISO();
    const parts = [...c.parts].sort((a, b) => {
        if (!a.release_date) return 1;
        if (!b.release_date) return -1;
        return a.release_date.localeCompare(b.release_date);
    });
    const released = parts.filter((p) => !!p.release_date && p.release_date <= today);
    const seen = released.filter((p) => tiers.has(p.id)).length;
    const nextPart = released.find((p) => !tiers.has(p.id)) ?? null;
    const upPart = parts.find((p) => !p.release_date || p.release_date > today) ?? null;
    return {
        id: c.id, name: c.name, backdrop: c.backdrop_path, poster: c.poster_path,
        total: parts.length, released: released.length, seen,
        next: nextPart ? { id: nextPart.id, title: nextPart.title } : null,
        upcoming: upPart ? { id: upPart.id, title: upPart.title, date: upPart.release_date || null } : null,
        following,
    };
}

/** A medias: has visto alguna estrenada pero no todas. */
const halfway = (s: SagaCard) => s.seen > 0 && s.seen < s.released;

export async function getSagaShelf(): Promise<{ following: SagaCard[]; suggested: SagaCard[] }> {
    const [followed, tiers, mine] = await Promise.all([
        getFollowedCollections(),
        getWatchedMovieTiers().catch(() => new Map<number, WatchedTier>()),
        getUserCollections().catch(() => [] as MovieCollectionInfo[]),
    ]);
    const followedIds = new Set(followed.map((f) => f.id));

    const infos = await processBatch(followed.map((f) => f.id), (id: number) => getMovieCollectionInfo(id), 6);
    const following: SagaCard[] = [];
    followed.forEach((f, i) => {
        const info = infos[i];
        // Si TMDB no responde, la tarjeta sale igual con lo guardado al seguirla.
        following.push(info ? toCard(info, tiers, true) : {
            id: f.id, name: f.name, backdrop: f.backdrop_path, poster: f.poster_path,
            total: 0, released: 0, seen: 0, next: null, upcoming: null, following: true,
        });
    });
    // Primero lo que tiene estreno con fecha (el más cercano antes), luego las que tienes a medias, luego el resto.
    const rank = (s: SagaCard) => (s.upcoming?.date ? 0 : halfway(s) ? 1 : 2);
    following.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.upcoming!.date!.localeCompare(b.upcoming!.date!) : 0));

    const suggested = mine.filter((c) => !followedIds.has(c.id)).map((c) => toCard(c, tiers, false));
    // A medias primero; luego sin empezar; las completas al final.
    const srank = (s: SagaCard) => (halfway(s) ? 0 : s.seen === 0 ? 1 : 2);
    suggested.sort((a, b) => srank(a) - srank(b));

    return { following, suggested };
}
