/**
 * Genera los iconos de la app instalable a partir de `public/logo_yourfavs.png`.
 *
 *   node scripts/build-pwa-icons.mjs [--variant=A|B]
 *
 *     A  claqueta con su degradado sobre azul noche (#0B1220, el fondo del tema oscuro)
 *     B  claqueta con su degradado sobre blanco
 *
 * La variante manda en el icono de la APP INSTALADA, que es uno solo y para siempre: iOS lo
 * congela al instalar, así que cambiarlo después no repinta el que ya está en tu pantalla.
 *
 * Por qué un script y no tres PNG sueltos en el repo: el logo de origen tiene muchísimo aire
 * alrededor (la marca ocupa 517px de un lienzo de 1024) y cada destino quiere un margen
 * distinto. Con `.trim()` se quita ese aire una vez y luego cada icono se compone con el suyo:
 * el normal al 66% y el *maskable* al 52%, porque Android le recorta un círculo y todo lo que
 * salga de la zona segura (el 80% central) se pierde.
 *
 * Salidas (todas en `public/`, que Netlify sirve tal cual en la raíz):
 *   icons/icon-192.png · icons/icon-512.png · icons/icon-maskable-512.png
 *   icons/icon-monochrome-512.png ← silueta para los «iconos temáticos» de Android 13+: el
 *                                   sistema la tiñe con los colores del fondo de pantalla,
 *                                   que es lo más cerca que se puede estar de un icono que
 *                                   sigue al tema del usuario.
 *   apple-touch-icon.png  ← iOS. SIN transparencia: Apple no la respeta, pone negro detrás.
 *
 * El FAVICON de la pestaña no sale de aquí: es `public/favicon.svg` (+ PNG de 16 y 32), la misma
 * claqueta redibujada en SVG (rediseño, Fase 8 · 8.1).
 *
 * Usa `sharp`, que ya viene con Astro. No añade ninguna dependencia.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'public/logo_yourfavs.png';
const variant = (process.argv.find(a => a.startsWith('--variant=')) || '--variant=A').split('=')[1].toUpperCase();

/** Fondo de cada variante. `mark: 'blanco'` repinta la claqueta en blanco (silueta). */
const VARIANTS = {
    A: { bg: { r: 11, g: 18, b: 32, alpha: 1 }, mark: 'color' },
    B: { bg: { r: 255, g: 255, b: 255, alpha: 1 }, mark: 'color' },
};
const cfg = VARIANTS[variant];
if (!cfg) throw new Error(`Variante desconocida: ${variant}. Usa A o B.`);

const NAVY = { r: 11, g: 18, b: 32, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const NADA = { r: 0, g: 0, b: 0, alpha: 0 };

/** El logo sin el aire que trae alrededor. */
const mark = await sharp(SRC).trim({ threshold: 10 }).toBuffer();

/** La marca al tamaño interior pedido, en su color o como silueta blanca. */
async function markAt(px, silueta = false) {
    const scaled = sharp(mark).resize(px, px, { fit: 'contain', background: NADA });
    if (!silueta) return scaled.toBuffer();
    // `blend: 'in'` pinta blanco SOLO donde la marca es opaca: conserva la forma y tira el color.
    return scaled
        .composite([{ input: { create: { width: px, height: px, channels: 4, background: '#ffffff' } }, blend: 'in' }])
        .toBuffer();
}

/**
 * `fill` = qué fracción del lienzo ocupa la marca.
 * `flatten` quita el canal alfa (obligatorio en el icono de iOS).
 */
async function icon(file, size, fill, { bg = cfg.bg, flatten = false, silueta = false } = {}) {
    const inner = Math.round(size * fill);
    let img = sharp({ create: { width: size, height: size, channels: 4, background: bg } })
        .composite([{ input: await markAt(inner, silueta), gravity: 'center' }]);
    if (flatten) img = img.flatten({ background: bg });
    await img.png().toFile(file);
    console.log('  \u2713', file);
}

await mkdir('public/icons', { recursive: true });
console.log(`Iconos de la app instalada — variante ${variant}:`);
await icon('public/icons/icon-192.png', 192, 0.66);
await icon('public/icons/icon-512.png', 512, 0.66);
// Maskable: Android le recorta un circulo, asi que la marca se queda en la zona segura.
await icon('public/icons/icon-maskable-512.png', 512, 0.52);
// Monocromo: silueta sobre transparente. Android 13+ la tine con el fondo de pantalla.
await icon('public/icons/icon-monochrome-512.png', 512, 0.52, { bg: NADA, silueta: true });
await icon('public/apple-touch-icon.png', 180, 0.66, { flatten: true });
