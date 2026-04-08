export function calculateAge(birthday: string | null | undefined): number | null {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

export function processProductions<T extends { release_date?: string; first_air_date?: string }>(
    items: T[],
    dateField: 'release_date' | 'first_air_date',
    limit: number = 9
) {
    const today = new Date();
    const dateKey = dateField === 'release_date' ? 'release_date' : 'first_air_date';

    const released = items
        .filter((item: any) => item[dateKey] && new Date(item[dateKey]) <= today)
        .sort((a: any, b: any) => new Date(b[dateKey]).getTime() - new Date(a[dateKey]).getTime())
        .slice(0, limit);

    const upcoming = items
        .filter((item: any) => item[dateKey] && new Date(item[dateKey]) > today)
        .sort((a: any, b: any) => new Date(a[dateKey]).getTime() - new Date(b[dateKey]).getTime())
        .slice(0, limit);

    return { released, upcoming };
}
