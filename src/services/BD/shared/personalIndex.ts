import { processBatch } from '../../../utils/processBatch';
import { tmdbFetch } from '../../API/shared/tmdbClient';
import { getCurrentUid } from './userScope';
import { getAllMediaTags } from './mediaTags';
import { getLibrarySnapshot } from './librarySnapshot';

/**
 * 4.3 · Índice de "lo mío" para el buscador ⌘K.
 *
 * La biblioteca guarda solo ids de TMDB (sin título), así que resolver títulos
 * exige una pasada a TMDB. Para no pagarla en cada tecleo, se construye una vez
 * y se cachea en memoria POR UID ~1h; los teclidos siguientes filtran en local.
 * Es opt-in: solo se construye cuando el usuario busca en modo "Lo mío".
 */

const TTL_MS = 60 * 60 * 1000;

export interface PersonalIndexItem {
    id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    lists: string[];      // etiquetas de las listas donde está (Favoritos, Vistos…)
    rating: number | null;
    tags: string[];
    /** título + tags normalizados (sin diacríticos, minúsculas) para el match */
    searchText: string;
}

interface CacheEntry { data: PersonalIndexItem[]; expires: number }
const cache = new Map<string, CacheEntry>();

export function invalidatePersonalIndexCache(uid?: string) {
    if (uid) cache.delete(uid); else cache.clear();
}

/** minúsculas + sin diacríticos, para comparar sin acentos */
export function foldText(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface RawAgg { id: string; media_type: 'movie' | 'tv'; lists: string[]; rating: number | null }

function aggregate(groups: { items: any[]; label: string }[], mediaType: 'movie' | 'tv'): Map<string, RawAgg> {
    const map = new Map<string, RawAgg>();
    for (const { items, label } of groups) {
        for (const it of items) {
            const id = String(it.id);
            const r = Number(it.rating) || null;
            const cur = map.get(id);
            if (cur) {
                if (!cur.lists.includes(label)) cur.lists.push(label);
                if (r && (!cur.rating || r > cur.rating)) cur.rating = r;
            } else {
                map.set(id, { id, media_type: mediaType, lists: [label], rating: r });
            }
        }
    }
    return map;
}

export async function buildPersonalIndex(): Promise<PersonalIndexItem[]> {
    const uid = getCurrentUid();
    if (!uid) return [];
    const now = Date.now();
    const cached = cache.get(uid);
    if (cached && cached.expires > now) return cached.data;

    const {
        movFavs, movPend, movVistos, movLike, movVerPronto,
        tvFavs, tvPend, tvVistos, tvSig, tvLike, tvVerPronto, tvAbandonadas,
    } = await getLibrarySnapshot();

    const movieAgg = aggregate([
        { items: movFavs, label: 'Favoritos' }, { items: movLike, label: 'Me gusta' },
        { items: movVistos, label: 'Vistos' }, { items: movPend, label: 'Pendientes' },
        { items: movVerPronto, label: 'Ver pronto' },
    ], 'movie');
    const tvAgg = aggregate([
        { items: tvFavs, label: 'Favoritos' }, { items: tvSig, label: 'Siguiendo' },
        { items: tvLike, label: 'Me gusta' }, { items: tvVistos, label: 'Vistos' },
        { items: tvPend, label: 'Pendientes' }, { items: tvVerPronto, label: 'Ver pronto' },
        { items: tvAbandonadas, label: 'Abandonadas' },
    ], 'tv');

    // Tags por título (una lectura de toda la colección MediaTags)
    const allTags = await getAllMediaTags();
    const tagsById = new Map<string, string[]>();
    for (const t of allTags) {
        if (t.tags?.length) tagsById.set(`${t.media_type}_${t.tmdb_id}`, t.tags);
    }

    const raws = [...movieAgg.values(), ...tvAgg.values()];

    // Resolver título + póster (cacheado 1h, así que solo en frío)
    const items = await processBatch(
        raws,
        async (r: RawAgg): Promise<PersonalIndexItem> => {
            let title = '';
            let poster_path: string | null = null;
            try {
                const d: any = await tmdbFetch<any>(`/${r.media_type}/${r.id}`);
                title = (r.media_type === 'movie' ? d?.title : d?.name) || '';
                poster_path = d?.poster_path || null;
            } catch { /* título queda vacío → se filtra abajo */ }
            const tags = tagsById.get(`${r.media_type}_${r.id}`) || [];
            return {
                id: r.id,
                media_type: r.media_type,
                title,
                poster_path,
                lists: r.lists,
                rating: r.rating,
                tags,
                searchText: foldText([title, ...tags].join(' ')),
            };
        },
        10
    );

    const data = items.filter(i => i.title);
    cache.set(uid, { data, expires: now + TTL_MS });
    return data;
}
