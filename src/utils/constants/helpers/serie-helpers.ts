export function formatRuntime(minutes: number): string {
    if (!minutes) return "Duración no disponible";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours > 0 ? `${hours} hr ${remainingMinutes} min` : `${minutes} min`;
}

export function getSeasonStats(seasonEpisodes: any[]) {
    if (!seasonEpisodes || seasonEpisodes.length === 0) {
        return { totalEpisodes: 0, averageRating: "0.0", averageRuntime: "No disponible", totalWatchtime: null, bestEpisode: null, dateRange: null };
    }

    const totalEpisodes = seasonEpisodes.length;
    const ratingsSum = seasonEpisodes.reduce((sum, ep) => sum + (ep.vote_average || 0), 0);
    const averageRating = totalEpisodes > 0 ? (ratingsSum / totalEpisodes).toFixed(1) : "0.0";

    const runtimesSum = seasonEpisodes.reduce((sum, ep) => sum + (ep.runtime || 0), 0);
    const episodesWithRuntime = seasonEpisodes.filter(ep => ep.runtime && ep.runtime > 0);
    const averageRuntimeMinutes = episodesWithRuntime.length > 0 ? Math.round(runtimesSum / episodesWithRuntime.length) : 0;
    const averageRuntime = averageRuntimeMinutes > 0 ? formatRuntime(averageRuntimeMinutes) : "No disponible";

    // Watchtime total
    const totalMinutes = episodesWithRuntime.reduce((sum, ep) => sum + ep.runtime, 0);
    const totalWatchtime = totalMinutes > 0 ? formatRuntime(totalMinutes) : null;

    // Mejor episodio
    const ratedEpisodes = seasonEpisodes.filter(ep => ep.vote_average > 0);
    const bestEpisode = ratedEpisodes.length > 0
        ? ratedEpisodes.reduce((best, ep) => ep.vote_average > best.vote_average ? ep : best)
        : null;

    // Rango de fechas
    const dates = seasonEpisodes.filter(ep => ep.air_date).map(ep => new Date(ep.air_date));
    let dateRange: string | null = null;
    if (dates.length > 1) {
        const first = dates.reduce((a, b) => a < b ? a : b);
        const last = dates.reduce((a, b) => a > b ? a : b);
        const formatShort = (d: Date) => d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        dateRange = formatShort(first) === formatShort(last) ? formatShort(first) : `${formatShort(first)} - ${formatShort(last)}`;
    }

    return { totalEpisodes, averageRating, averageRuntime, totalWatchtime, bestEpisode, dateRange };
}
