import { tmdbFetch, tmdbFetchList, posterUrl } from '../shared/tmdbClient';
import { getSeriesSiguiendo } from '../../BD/series/yourfavsSerie';
import { getAllNotificationSubs } from '../../BD/notifications/yourfavsNotifications';
import { getUpcomingFromFollowedPeople } from '../People/upcomingReleases';
import { fetchSerieDetails } from '../Series/tmdbSeries';
import { fetchMovieDetails } from '../Movies/tmdbMovies';
import { processBatch } from '../../../utils/processBatch';
import { episodeTypeLabel } from '../../../utils/episodeType';
import { episodeHref } from '../../../utils/episodeView';

export interface CalendarEvent {
    tmdb_id: string;
    media_type: 'movie' | 'tv';
    title: string;
    poster_path: string;
    event_type: 'movie_premiere' | 'episode' | 'season_premiere' | 'person_release';
    label: string;
    is_subscribed: boolean;
    is_following: boolean;
    /** Solo person_release: a quién sigues que te trae este estreno. */
    person_name?: string;
    /**
     * A dónde lleva (TMDB D4): un episodio, a su ficha; una temporada entera, a esa temporada en la
     * ficha de serie. Sin él, a la ficha del título (lo de siempre, y lo que traen las cachés viejas).
     */
    href?: string;
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

/**
 * ¿Hay que ocultar el nombre del episodio para este usuario? En un helper para que las tres
 * puertas de entrada al calendario (página, endpoint del mes y feed .ics) digan lo mismo: si una
 * se olvidara, el .ics filtraría por correo justo lo que la web tapa.
 */
export function hideEpisodeTitlesFor(user: SessionUser | null | undefined): boolean {
    const s = user?.spoilers;
    return s?.enabled === true && s.hideCalendarTitles === true;
}

export interface CalendarOptions {
    /**
     * Modo sin spoilers (§2 · A3b): la etiqueta del episodio se queda en "T2 E5" sin el nombre.
     * Se resuelve en el llamante desde `locals.user.spoilers`, porque este servicio también lo
     * consume el feed .ics y conviene que los dos digan lo mismo.
     */
    hideEpisodeTitles?: boolean;
}

export async function getCalendarData(
    year: number,
    month: number,
    opts: CalendarOptions = {},
): Promise<CalendarData> {
    // Etiqueta de episodio: "T2 E5" y, si se permite, " - Nombre del episodio".
    // B2b: «· Final de temporada» / «· Parón…» según `episode_type` (no es spoiler: va también sin títulos).
    const epLabel = (s: number | string, e: number | string, name?: string | null, episodeType?: string | null) => {
        const kind = episodeTypeLabel(episodeType);
        return `T${s} E${e}${name && !opts.hideEpisodeTitles ? ' - ' + name : ''}${kind ? ' · ' + kind.charAt(0).toUpperCase() + kind.slice(1) : ''}`;
    };

    const { start, end } = getMonthRange(year, month);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

    // Fetch en paralelo: películas, series populares en emisión, series siguiendo, suscripciones, estrenos de personas seguidas
    const [upcomingMoviesP1, upcomingMoviesP2, popularSeriesP1, popularSeriesP2, followedSeriesIds, notifSubs, personUpcoming] = await Promise.all([
        tmdbFetchList<any>('/discover/movie', {
            'primary_release_date.gte': start,
            'primary_release_date.lte': end,
            sort_by: 'popularity.desc',
            page: '1',
        }),
        tmdbFetchList<any>('/discover/movie', {
            'primary_release_date.gte': start,
            'primary_release_date.lte': end,
            sort_by: 'popularity.desc',
            page: '2',
        }),
        // Series populares en emisión (con air_date en el rango del mes)
        tmdbFetchList<any>('/discover/tv', {
            'air_date.gte': start,
            'air_date.lte': end,
            sort_by: 'popularity.desc',
            page: '1',
        }),
        tmdbFetchList<any>('/discover/tv', {
            'air_date.gte': start,
            'air_date.lte': end,
            sort_by: 'popularity.desc',
            page: '2',
        }),
        getSeriesSiguiendo().then(series => series.map(s => s.id)),
        getAllNotificationSubs(),
        getUpcomingFromFollowedPeople().catch(() => []),
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

    // 0. Estrenos de personas seguidas. Prioridad de atribución de un título:
    //    1º campana en el título  >  2º varios actores seguidos  >  3º un actor.
    // Si tienes la campana en este título, NO lo atribuimos a la persona aquí:
    // dejamos que el loop de películas/series lo añada como "suscrito" (la campana
    // gana el dedup). Solo atribuimos a personas cuando NO hay campana.
    for (const u of personUpcoming) {
        if (!isInMonth(u.release_date, year, month)) continue;
        if (notifSet.has(`${u.media_type}_${u.tmdb_id}`)) continue; // campana → gana la suscripción

        const names = u.person_names?.length ? u.person_names : [u.person_name];
        const label = names.length > 1
            ? `Estreno · avisos de ${names[0]} y ${names.length - 1} más`
            : `Estreno · tienes avisos de ${names[0]}`;
        addEvent(u.release_date, {
            tmdb_id: u.tmdb_id,
            media_type: u.media_type,
            title: u.title,
            poster_path: posterUrl(u.poster_path),
            event_type: 'person_release',
            label,
            is_subscribed: true, // seguir a la persona = aviso (sale en la barra de avisos)
            is_following: false,
            person_name: names[0],
        });
    }

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
    // Set de IDs que son seguidas o suscritas (para estas hacemos fetch de temporada completa)
    const personalSerieIds = new Set([...followedSeriesIds, ...serieNotifIds]);

    for (const serie of seriesDetails) {
        if (!serie) continue;
        const serieIdStr = String(serie.id);
        const isFollowing = followedSeriesIds.includes(serieIdStr);
        const isSub = notifSet.has(`tv_${serieIdStr}`);
        const isPersonal = personalSerieIds.has(serieIdStr);

        const nextEp = serie.next_episode_to_air;
        const lastEp = serie.last_episode_to_air;

        // Determinar temporada actual (la que tiene episodios en emisión)
        const currentSeasonNum = nextEp?.season_number || lastEp?.season_number;

        // Para series seguidas/suscritas: fetch temporada completa para obtener TODOS los episodios del mes
        if (isPersonal && currentSeasonNum) {
            try {
                const seasonData = await tmdbFetch<any>(`/tv/${serie.id}/season/${currentSeasonNum}`);
                const episodes = seasonData.episodes || [];
                const monthEpisodes = episodes.filter((ep: any) => ep.air_date && isInMonth(ep.air_date, year, month));

                if (monthEpisodes.length > 0) {
                    // Detectar temporada completa: todos los episodios el mismo día
                    const firstDate = monthEpisodes[0].air_date;
                    const allSameDate = monthEpisodes.length > 1 && monthEpisodes.every((ep: any) => ep.air_date === firstDate);

                    if (allSameDate && monthEpisodes.length === episodes.length) {
                        // Temporada completa de golpe
                        addEvent(firstDate, {
                            tmdb_id: serieIdStr,
                            media_type: 'tv',
                            title: serie.name,
                            poster_path: posterUrl(serie.poster_path),
                            event_type: 'season_premiere',
                            label: `Temporada ${currentSeasonNum} completa (${episodes.length} eps)`,
                            href: `/serie/${serieIdStr}#season-${currentSeasonNum}`,
                            is_subscribed: isSub,
                            is_following: isFollowing,
                        });
                    } else {
                        // Episodios individuales (semanal u otro patrón)
                        for (const ep of monthEpisodes) {
                            addEvent(ep.air_date, {
                                tmdb_id: serieIdStr,
                                media_type: 'tv',
                                title: serie.name,
                                poster_path: posterUrl(serie.poster_path),
                                event_type: 'episode',
                                label: epLabel(ep.season_number, ep.episode_number, ep.name, ep.episode_type),
                                href: episodeHref(serieIdStr, ep.season_number, ep.episode_number),
                                is_subscribed: isSub,
                                is_following: isFollowing,
                            });
                        }
                    }
                    continue; // Ya procesamos todos los episodios, saltar al siguiente serie
                }
            } catch {}
        }

        // Para series populares (no personales) o si el fetch de temporada falló:
        // solo mostrar next_episode_to_air y/o last_episode_to_air
        if (nextEp && isInMonth(nextEp.air_date, year, month)) {
            addEvent(nextEp.air_date, {
                tmdb_id: serieIdStr,
                media_type: 'tv',
                title: serie.name,
                poster_path: posterUrl(serie.poster_path),
                event_type: 'episode',
                label: epLabel(nextEp.season_number, nextEp.episode_number, nextEp.name, nextEp.episode_type),
                href: episodeHref(serieIdStr, nextEp.season_number, nextEp.episode_number),
                is_subscribed: isSub,
                is_following: isFollowing,
            });
        }

        if (lastEp && isInMonth(lastEp.air_date, year, month)) {
            addEvent(lastEp.air_date, {
                tmdb_id: serieIdStr,
                media_type: 'tv',
                title: serie.name,
                poster_path: posterUrl(serie.poster_path),
                event_type: 'episode',
                label: epLabel(lastEp.season_number, lastEp.episode_number, lastEp.name, lastEp.episode_type),
                href: episodeHref(serieIdStr, lastEp.season_number, lastEp.episode_number),
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
