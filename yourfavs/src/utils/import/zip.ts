/**
 * Lector de ZIP mínimo para la importación de Letterboxd (TMDB D3b). Corre en el navegador y sin
 * dependencias: lee el directorio central del ZIP y descomprime cada CSV con `DecompressionStream`
 * ('deflate-raw', en Chrome, Safari y Firefox actuales). Solo lo que hace falta: entradas guardadas
 * (método 0) o comprimidas (método 8), sin ZIP64 ni cifrado; la exportación de Letterboxd es así.
 */
export async function readZipTexts(file: Blob, wanted: (path: string) => boolean): Promise<Map<string, string>> {
    const buf = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buf.buffer);
    const out = new Map<string, string>();

    // Fin del directorio central: firma 0x06054b50, al final (puede llevar un comentario detrás).
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No es un ZIP');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);

    const decoder = new TextDecoder('utf-8');
    for (let n = 0; n < count; n++) {
        if (view.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP dañado');
        const method = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const local = view.getUint32(p + 42, true);
        const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;

        if (name.endsWith('/') || name.startsWith('__MACOSX/') || !wanted(name)) continue;
        // La cabecera local tiene sus propias longitudes de nombre y extra.
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = buf.subarray(start, start + compSize);
        if (method === 0) out.set(name, decoder.decode(data));
        else if (method === 8) out.set(name, await inflate(data));
    }
    return out;
}

async function inflate(data: Uint8Array): Promise<string> {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
}
