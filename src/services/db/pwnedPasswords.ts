/**
 * ¿Ha salido esta contraseña en alguna filtración de datos? (QA 4.5). Consulta *Have I Been Pwned* con
 * k-anonimato: se calcula el SHA-1 de la contraseña y solo se envían sus 5 primeros caracteres; el servicio
 * devuelve los sufijos que empiezan así y la comparación se hace aquí. Ni la contraseña ni su resumen
 * completo salen del servidor. `Add-Padding` hace que todas las respuestas pesen parecido.
 *
 * Si el servicio no responde en 2,5 s (o falla), devuelve `false`: mejor dejar pasar que bloquear el registro.
 * Es lo mismo que Supabase ofrece como «Leaked password protection» en sus planes de pago.
 */
const TIMEOUT_MS = 2500;

export async function isPwnedPassword(password: string): Promise<boolean> {
    try {
        const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
        const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'Add-Padding': 'true', 'User-Agent': 'YourFavs' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return false;
        const text = await res.text();
        return text.split('\n').some((line) => {
            const [s, count] = line.trim().split(':');
            return s === suffix && Number(count) > 0;
        });
    } catch {
        return false;
    }
}
