export function buildUrl(baseUrl: URL, params: Record<string, string>): string {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value && value !== 'todos' && value !== '' && value !== '1') {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    return url.pathname + url.search;
}
