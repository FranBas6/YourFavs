function parseDate(value?: string | null): number {
    if (!value) return 0;
    const t = Date.parse(value);
    return isNaN(t) ? 0 : t;
}

export function sortBycriterion<T extends Record<string, any>>(
    list: T[],
    criterion: string,
    dateField: string = 'release_date'
): T[] {
    const items = [...list];
    switch (criterion) {
        case 'popularity':
            return items.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        case 'date':
            return items.sort((a, b) => parseDate(b[dateField]) - parseDate(a[dateField]));
        case 'quality':
        default:
            return items.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    }
}
