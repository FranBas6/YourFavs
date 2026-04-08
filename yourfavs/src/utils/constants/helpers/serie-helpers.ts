export function formatRuntime(minutes: number): string {
    if (!minutes) return "Duración no disponible";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours > 0 ? `${hours} hr ${remainingMinutes} min` : `${minutes} min`;
}

export function getSeasonStats(seasonEpisodes: any[]) {
    if (!seasonEpisodes || seasonEpisodes.length === 0) {
        return { totalEpisodes: 0, averageRating: "0.0", averageRuntime: "No disponible" };
    }

    const totalEpisodes = seasonEpisodes.length;
    const ratingsSum = seasonEpisodes.reduce((sum, ep) => sum + (ep.vote_average || 0), 0);
    const averageRating = totalEpisodes > 0 ? (ratingsSum / totalEpisodes).toFixed(1) : "0.0";

    const runtimesSum = seasonEpisodes.reduce((sum, ep) => sum + (ep.runtime || 0), 0);
    const episodesWithRuntime = seasonEpisodes.filter(ep => ep.runtime && ep.runtime > 0);
    const averageRuntimeMinutes = episodesWithRuntime.length > 0 ? Math.round(runtimesSum / episodesWithRuntime.length) : 0;
    const averageRuntime = averageRuntimeMinutes > 0 ? formatRuntime(averageRuntimeMinutes) : "No disponible";

    return { totalEpisodes, averageRating, averageRuntime };
}
