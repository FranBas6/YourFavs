/**
 * Límites de lo que escribe el usuario, los MISMOS en la interfaz (maxlength, contadores) y en el servidor
 * (QA 3.4, H41: la interfaz limitaba el nombre a 32 y el servidor aceptó 55). Puro: lo usan las dos capas.
 * Otros límites viven junto a su tema y ya coinciden: bio del perfil público 280
 * (`services/social/publicSettings.ts`), colecciones 60/280 (`services/library/customLists.ts`), etiquetas
 * 32 (`services/titles/mediaTags.ts`), notas del diario 500 y mensajes 2.000 (en la base de datos).
 */
export const DISPLAY_NAME_MAX = 32;
export const OPINION_MAX = 2000;
/** Contraseña mínima al crearla o cambiarla (QA 4.5, H08: antes 6). Quien ya tiene una más corta sigue entrando. */
export const PASSWORD_MIN = 8;
/** Lo que hay que escribir para eliminar la cuenta (QA 4.5, H72). */
export const DELETE_WORD = 'ELIMINAR';

/** Caracteres de control (y los invisibles de dirección de texto, que pueden desordenar lo que se pinta). */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

/** Texto de una línea: sin controles ni saltos, espacios colapsados, recortado a `max` caracteres. */
export function cleanLine(raw: unknown, max: number): string {
    const s = String(raw ?? '').replace(CONTROL, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, max).join('');
}

/** Texto de varias líneas: sin controles (los saltos se quedan), recortado a `max` caracteres. */
export function cleanText(raw: unknown, max: number): string {
    const s = String(raw ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
    return Array.from(s).slice(0, max).join('');
}

/** Longitud en caracteres de verdad (un emoji cuenta uno), tras limpiar como `cleanLine`. */
export const lineLength = (raw: unknown): number => Array.from(String(raw ?? '').replace(CONTROL, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()).length;
