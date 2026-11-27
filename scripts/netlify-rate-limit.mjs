/**
 * Freno por IP para la función de Astro en Netlify (rastreo masivo de 2026-11-26/27).
 *
 * El adapter de Astro escribe `.netlify/v1/functions/ssr/ssr.mjs` con su `export const config` y no deja
 * añadirle nada. Este script corre DESPUÉS de `astro build` (ver `build` en package.json) y mete en ese
 * config un `rateLimit` de Netlify: si una misma IP pasa de WINDOW_LIMIT peticiones a la función en
 * WINDOW_SIZE segundos, Netlify le contesta 429 en el borde, sin ejecutar la función.
 *
 * - Solo afecta a lo que pasa por la función (páginas y /api). Lo estático (`preferStatic`) y lo que ya
 *   está en la caché del CDN no cuenta.
 * - Plan gratis: hasta 2 reglas en código por proyecto; esta usa 1. Ventana máxima: 180 s.
 * - Netlify tarda hasta ~10 s en empezar a bloquear a una IP que se pasa.
 * - Si el adapter cambia el formato y no se encuentra el config, el build FALLA a propósito: mejor enterarse
 *   que desplegar sin freno creyendo que lo hay.
 */
import { readFile, writeFile } from 'node:fs/promises';

// Una persona navegando deprisa (fichas + las llamadas /api de cada una) no pasa de ~50 por minuto.
// El rastreador del 27-11 iba a 2-4 por segundo (120-240 por minuto).
const WINDOW_LIMIT = 120;
const WINDOW_SIZE = 60;

const file = new URL('../.netlify/v1/functions/ssr/ssr.mjs', import.meta.url);
const src = await readFile(file, 'utf8');

if (src.includes('rateLimit:')) {
    console.log('[netlify-rate-limit] ssr.mjs ya tiene rateLimit; no se toca.');
    process.exit(0);
}

const anchor = "preferStatic: true,";
if (!src.includes(anchor)) {
    console.error('[netlify-rate-limit] No encuentro el config de la función SSR (¿cambió @astrojs/netlify?).');
    process.exit(1);
}

const rule = `${anchor}
					rateLimit: { windowLimit: ${WINDOW_LIMIT}, windowSize: ${WINDOW_SIZE}, aggregateBy: ['ip', 'domain'] },`;
await writeFile(file, src.replace(anchor, rule));
console.log(`[netlify-rate-limit] Freno puesto: ${WINDOW_LIMIT} peticiones por IP cada ${WINDOW_SIZE} s.`);
