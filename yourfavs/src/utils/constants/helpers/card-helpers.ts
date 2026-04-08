export function formatCardDate(dateString: string | undefined): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {year: "numeric", month: "short", day: "numeric"});
}

export function getRatingColor(rating: number): string {
    if (rating >= 8) return "bg-emerald-500 text-white";
    if (rating >= 7) return "bg-green-500 text-white";
    if (rating >= 6) return "bg-yellow-500 text-gray-900";
    if (rating >= 5) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
}

export function getPopularityColor(pop: number): string {
    if (pop >= 20) return "bg-emerald-500 text-white";
    if (pop >= 15) return "bg-green-500 text-white";
    if (pop >= 10) return "bg-yellow-500 text-gray-900";
    if (pop >= 5) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
}

export function formatCategoryForUrl(name: string): string {
    return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ /g, "_");
}

export function isRecentRelease(dateString: string | undefined): boolean {
    if (!dateString) return false;
    return (new Date().getTime() - new Date(dateString).getTime()) < (90 * 24 * 60 * 60 * 1000);
}
