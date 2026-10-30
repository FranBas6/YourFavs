export async function loadAllPages<T>(
    getDataFunction: (params: { [key: string]: string }) => Promise<T[]>,
    searchTerm: string,
    paramName: string = "title",
    maxPages: number = 5
): Promise<T[]> {
    let page = 1;
    let allItems: T[] = [];
    let hasMore = true;

    while (hasMore && page <= maxPages) {
        try {
            const params: { [key: string]: string } = {page: page.toString()};
            params[paramName] = searchTerm;

            const result = await getDataFunction(params);
            if (result.length > 0) {
                allItems = allItems.concat(result);
                page++;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`Error al cargar la página ${page}:`, error);
            hasMore = false;
        }
    }
    return allItems;
}
