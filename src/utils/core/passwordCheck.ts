/**
 * Contraseña segura sin reglas de composición (QA 4.5, opción A acordada con Fran): mínimo de 8
 * (`PASSWORD_MIN`), fuera las obvias (esto) y fuera las filtradas (`services/db/pwnedPasswords.ts`, en el
 * servidor). La fuerza es solo orientativa: anima a usar frases largas, no bloquea.
 * Sin mayúscula/número/símbolo obligatorios a propósito (NIST SP 800-63B): empujan a `Yourfavs1!`.
 * Puro: lo usan el registro y «Nueva contraseña» en el navegador (aviso al momento) y el servidor.
 */
const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertyuiopasdfghjklzxcvbnm'];

/** Por qué es obvia (texto para el usuario) o null si no lo es. `email`: la del registro o la cuenta. */
export function obviousPasswordReason(password: string, email?: string | null): string | null {
    const p = password.toLowerCase();
    if (/^(.)\1+$/.test(p)) return 'No puede ser el mismo carácter repetido.';
    for (const seq of SEQUENCES) {
        if (seq.includes(p) || [...seq].reverse().join('').includes(p)) return 'No puede ser una secuencia como «12345678» o «qwerty».';
    }
    const local = (email ?? '').toLowerCase().split('@')[0];
    if (local && local.length >= 4 && (p.includes(local) || local.includes(p))) return 'No puede contener tu email.';
    if (/^yourfavs\W*\d*\W*$/.test(p)) return 'Demasiado fácil de adivinar: no uses el nombre de la web.';
    return null;
}

export type Strength = 0 | 1 | 2 | 3;

/**
 * 0 corta · 1 débil · 2 aceptable · 3 fuerte. Cuenta sobre todo la longitud (una frase larga es lo mejor)
 * y un poco la variedad.
 */
export function passwordStrength(password: string, minLength = 8): Strength {
    const len = Array.from(password).length;
    if (len < minLength) return 0;
    const kinds = [/[a-záéíóúñü]/, /[A-ZÁÉÍÓÚÑÜ]/, /\d/, /[^\wáéíóúñüÁÉÍÓÚÑÜ]/].filter((r) => r.test(password)).length;
    const unique = new Set(password.toLowerCase()).size;
    let score = 1;
    if (len >= 12 || (len >= 10 && kinds >= 3)) score++;
    if (len >= 16 || (len >= 12 && kinds >= 3)) score++;
    if (unique < 5) score = 1;
    return Math.min(3, score) as Strength;
}

export const STRENGTH_LABEL = ['Muy corta', 'Débil', 'Aceptable', 'Fuerte'] as const;
