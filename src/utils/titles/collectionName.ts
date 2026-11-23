/**
 * Nombre de una saga (colección de TMDB) para enseñar (2026-11-23).
 *
 * TMDB pone a casi todas un sufijo: «Dune - Colección», «Batman (El caballero oscuro) - Colección» y,
 * si no está traducida, «Demon Slayer: Kimetsu no Yaiba Collection». En la web ya se ve que es una
 * saga (página, sello, «Ver la saga»), así que se quita: «Dune», «Demon Slayer: Kimetsu no Yaiba».
 * Si al quitarlo no queda nada, se devuelve el original.
 */
const SUFFIXES = [
    /\s*[-–—:]\s*(colecci[oó]n|collection)\s*$/i, // «Dune - Colección», «X: Collection»
    /\s*\((colecci[oó]n|collection)\)\s*$/i,       // «Matrix (Colección)»
    /\s+(colecci[oó]n|collection)\s*$/i,          // «… Kimetsu no Yaiba Collection»
];
const PREFIX = /^\s*(colecci[oó]n|collection)\s*[:\-–—]?\s+/i; // «Colección Harry Potter»

export function cleanCollectionName(name: string | null | undefined): string {
    const raw = (name ?? '').trim();
    if (!raw) return '';
    let out = raw;
    for (const re of SUFFIXES) out = out.replace(re, '');
    out = out.replace(PREFIX, '').trim();
    return out || raw;
}
