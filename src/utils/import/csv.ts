/**
 * Lector de CSV mínimo (RFC 4180) para la importación (TMDB D3). Corre en el navegador: el fichero
 * no sale entero de tu equipo, solo los ids y títulos que hacen falta para buscarlo en TMDB.
 *
 * Comillas dobles con `""` dentro, comas y saltos de línea dentro de comillas, CRLF o LF y la marca
 * BOM del principio (los CSV de IMDb la llevan). Devuelve objetos por nombre de columna.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const records: string[][] = [];
    let record: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else quoted = false;
            } else field += ch;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === ',') { record.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            record.push(field); field = '';
            records.push(record); record = [];
        } else field += ch;
    }
    if (field !== '' || record.length) { record.push(field); records.push(record); }

    const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
    const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
    const rows = nonEmpty.map((r) => {
        const o: Record<string, string> = {};
        headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
        return o;
    });
    return { headers, rows };
}

/**
 * Huella del fichero (sha-256 en hex) para avisar si ya lo importaste. `null` donde el navegador no da
 * `crypto.subtle` (solo existe en https o localhost): se importa igual, sin el aviso de repetido.
 */
export async function fileHash(text: string): Promise<string | null> {
    if (!globalThis.crypto?.subtle) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
