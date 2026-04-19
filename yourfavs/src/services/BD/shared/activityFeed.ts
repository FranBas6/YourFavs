import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../utils/firebaseConfig";
import { getFirebaseTimestamp } from "../../../utils/constants/helpers/media-helpers";

export interface ActivityEvent {
    type: 'movie' | 'serie';
    id: string;
    collection: string;
    action: string;
    timestamp: number;
}

const COLLECTIONS: { name: string; type: 'movie' | 'serie'; action: string }[] = [
    { name: 'MovieFavs', type: 'movie', action: 'Añadida a Favoritos' },
    { name: 'MoviesPendientes', type: 'movie', action: 'Marcada como pendiente' },
    { name: 'MoviesVistas', type: 'movie', action: 'Marcada como vista' },
    { name: 'MoviesVerPronto', type: 'movie', action: 'Añadida a Ver Pronto' },
    { name: 'LikedMovies', type: 'movie', action: 'Me gusta' },
    { name: 'SeriesFavs', type: 'serie', action: 'Añadida a Favoritos' },
    { name: 'SeriesPendiente', type: 'serie', action: 'Marcada como pendiente' },
    { name: 'SeriesVistas', type: 'serie', action: 'Marcada como vista' },
    { name: 'SeriesSiguiendo', type: 'serie', action: 'Empezaste a seguir' },
    { name: 'LikedSeries', type: 'serie', action: 'Me gusta' },
    { name: 'SeriesVerPronto', type: 'serie', action: 'Añadida a Ver Pronto' },
];

export async function fetchAllActivityEvents(): Promise<ActivityEvent[]> {
    const results = await Promise.all(
        COLLECTIONS.map(async (c) => {
            try {
                const snap = await getDocs(collection(db, c.name));
                return snap.docs
                    .map(d => ({
                        type: c.type,
                        id: d.id,
                        collection: c.name,
                        action: c.action,
                        timestamp: getFirebaseTimestamp(d.data().added_at),
                    }))
                    .filter(e => e.timestamp > 0);
            } catch (error) {
                console.error(`Error al leer ${c.name}:`, error);
                return [];
            }
        })
    );
    return results.flat();
}
