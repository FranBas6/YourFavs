import { tmdbFetch, tmdbFetchList, posterUrl } from '../shared/tmdbClient';
import { getSeriesSiguiendo } from '../../BD/series/yourfavsSerie';
import { getAllNotificationSubs } from '../../BD/notifications/yourfavsNotifications';
import { fetchSerieDetails } from '../Series/tmdbSeries';
import { fetchMovieDetails } from '../Movies/tmdbMovies';
import { processBatch } from '../../../utils/processBatch';

export interface CalendarEvent {
    tmdb_id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string;
    event_type: 'movie_premiere' | 'episode' | 'season_premiere';
    label: string;
    is_subscribed: boolean;
    is_following: boolean;
}

export interface CalendarDay {
    date: string; // "2026-05-15"
    events: CalendarEvent[];
}

export interface CalendarData {
    year: number;
    month: number;
    days: CalendarDay[];
    today: string;
}

// Umbral mínimo de popularidad para filtrar contenido relevante
const MIN_MOVIE_POPULARITY = 20;

function getMonthRange(year: number, month: number) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}

function isInMonth(dateStr: string | undefined, year: number, month: number): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
}

export async function getCalendarData(year: number, month: number): Promise<CalendarData> {
    const { start, end } = getMonthRange(year, month);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    // Fetch en paralelo: películas, series populares en emisión, series siguiendo, suscripciones
    const [upcomingMoviesP1, upcomingMoviesP2, popularSeriesP1, popularSeriesP2, followedSeriesIds, notifSubs] = await Promise.all([
        tmdbFetchList<any>('/discover/movie', {
            'primary_release_date.gte': start,
            'primary_release_date.lte': end,
            sort_by: 'popularity.desc',
            watch_region: 'ES',
            page: '1',
        }),
        tmdbFetchList<any>('/discover/movie', {
            'primary_release_date.gte': start,
            'primary_release_date.lte': end,
            sort_by: 'popularity.desc',
            watch_region: 'ES',
            page: '2',
        }),
        // Series populares en emisión (con air_date en el rango del mes)
        tmdbFetchList<any>('/discover/tv', {
            'air_date.gte': start,
            'air_date.lte': end,
            sort_by: 'popularity.desc',
            watch_region: 'ES',
            page: '1',
        }),
        tmdbFetchList<any>('/discover/tv', {
            'air_date.gte': start,
            'air_date.lte': end,
            sort_by: 'popularity.desc',
            watch_region: 'ES',
            page: '2',
        }),
        getSeriesSiguiendo().then(series => series.map(s => s.id)),
        getAllNotificationSubs(),
    ]);

    // Filtrar películas: umbral bajo para no estrenadas, estricto para estrenadas
    const allUpcoming = [...upcomingMoviesP1, ...upcomingMoviesP2]
        .filter((m: any) => {
            const isUnreleased = m.release_date && new Date(m.release_date) > new Date();
            return m.popularity >= (isUnreleased ? 5 : MIN_MOVIE_POPULARITY);
        });

    // Filtrar series: umbral bajo para próximos episodios, estricto para ya emitidos
    const allPopularSeries = [...popularSeriesP1, ...popularSeriesP2]
        .filter((s: any) => s.popularity >= 10);

    // IDs de notificación para lookup rápido
    const notifSet = new Set(notifSubs.map(n => n.id));

    // IDs de suscripciones de películas no incluidas en upcoming
    const movieNotifIds = notifSubs
        .filter(n => n.media_type === 'movie' && !allUpcoming.some((m: any) => String(m.id) === n.tmdb_id))
        .map(n => n.tmdb_id);

    // IDs de suscripciones de series no siguiendo ni en populares
    const popularSerieIds = new Set(allPopularSeries.map((s: any) => String(s.id)));
    const serieNotifIds = notifSubs
        .filter(n => n.media_type === 'tv' && !followedSeriesIds.includes(n.tmdb_id) && !popularSerieIds.has(n.tmdb_id))
        .map(n => n.tmdb_id);

    // Fetch detalles de series: siguiendo + populares (para next_episode_to_air) + suscritas extra
    const followedAndSubIds = [...new Set([...followedSeriesIds, ...serieNotifIds])];
    // Solo fetch de series populares que no están ya en seguidas
    const popularToFetch = allPopularSeries
        .filter((s: any) => !followedAndSubIds.includes(String(s.id)))
        .map((s: any) => String(s.id));

    const allSerieIdsToFetch = [...followedAndSubIds, ...popularToFetch];

    const [seriesDetails, extraMovies] = await Promise.all([
        processBatch(allSerieIdsToFetch, (id) => fetchSerieDetails(id), 10),
        processBatch(movieNotifIds, (id) => fetchMovieDetails(id), 10),
    ]);

    // Map de eventos por fecha — Set para evitar duplicados (serie puede aparecer en popular + seguida)
    const eventsMap = new Map<string, CalendarEvent[]>();
    const addedEventKeys = new Set<string>(); // "tv_12345_2026-04-15"

    const addEvent = (date: string, event: CalendarEvent) => {
        const key = `${event.media_type}_${event.tmdb_id}_${date}`;
        if (addedEventKeys.has(key)) return; // evitar duplicados
        addedEventKeys.add(key);
        if (!eventsMap.has(date)) eventsMap.set(date, []);
        eventsMap.get(date)!.push(event);
    };

    // 1. Películas relevantes
    for (const movie of allUpcoming) {
        if (!movie.release_date || !isInMonth(movie.release_date, year, month)) continue;
        addEvent(movie.release_date, {
            tmdb_id: String(movie.id),
            media_type: 'movie',
            title: movie.title,
            poster_path: posterUrl(movie.poster_path),
            event_type: 'movie_premiere',
            label: 'Estreno en cines',
            is_subscribed: notifSet.has(`movie_${movie.id}`),
            is_following: false,
        });
    }

    // Películas suscritas extra (no en upcoming, sin filtro de popularidad)
    for (const movie of extraMovies) {
        if (!movie || !movie.release_date || !isInMonth(movie.release_date, year, month)) continue;
        addEvent(movie.release_date, {
            tmdb_id: String(movie.id),
            media_type: 'movie',
            title: movie.title,
            poster_path: posterUrl(movie.poster_path),
            event_type: 'movie_premiere',
            label: 'Estreno (suscrito)',
            is_subscribed: true,
            is_following: false,
        });
    }

    // 2. Series — siguiendo, suscritas y populares
    for (const serie of seriesDetails) {
        if (!serie) continue;
        const serieIdStr = String(serie.id);
        const isFollowing = followedSeriesIds.includes(serieIdStr);
        const isSub = notifSet.has(`tv_${serieIdStr}`);

        const nextEp = serie.next_episode_to_air;
        if (nextEp && isInMonth(nextEp.air_date, year, month)) {
            let eventType: CalendarEvent['event_type'] = 'episode';
            let label = `T${nextEp.season_number} E${nextEp.episode_number}`;
            if (nextEp.name) label += ` - ${nextEp.name}`;

            // Detectar temporada completa
            if (nextEp.episode_number === 1) {
                try {
                    const seasonData = await tmdbFetch<any>(`/tv/${serie.id}/season/${nextEp.season_number}`);
                    const episodes = seasonData.episodes || [];
                    const sameDate = episodes.filter((ep: any) => ep.air_date === nextEp.air_date);
                    if (sameDate.length > 1 && sameDate.length === episodes.length) {
                        eventType = 'season_premiere';
                        label = `Temporada ${nextEp.season_number} completa (${episodes.length} eps)`;
                    } else if (sameDate.length > 1) {
                        label = `T${nextEp.season_number} - ${sameDate.length} episodios`;
                    }
                } catch {}
            }

            addEvent(nextEp.air_date, {
                tmdb_id: serieIdStr,
                media_type: 'tv',
                title: serie.name,
                poster_path: posterUrl(serie.poster_path),
                event_type: eventType,
                label,
                is_subscribed: isSub,
                is_following: isFollowing,
            });
        }

        // last_episode_to_air del mes actual
        const lastEp = serie.last_episode_to_air;
        if (lastEp && isInMonth(lastEp.air_date, year, month)) {
            addEvent(lastEp.air_date, {
                tmdb_id: serieIdStr,
                media_type: 'tv',
                title: serie.name,
                poster_path: posterUrl(serie.poster_path),
                event_type: 'episode',
                label: `T${lastEp.season_number} E${lastEp.episode_number}${lastEp.name ? ' - ' + lastEp.name : ''}`,
                is_subscribed: isSub,
                is_following: isFollowing,
            });
        }
    }

    // Construir y ordenar días, eventos dentro de cada día por popularidad implícita (orden de inserción: películas primero, luego series)
    const days: CalendarDay[] = [];
    for (const [date, events] of eventsMap.entries()) {
        days.push({ date, events });
    }
    days.sort((a, b) => a.date.localeCompare(b.date));

    return { year, month, days, today };
}
