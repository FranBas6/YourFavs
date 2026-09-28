/**
 * Service worker de YourFavs — deliberadamente conservador.
 *
 * REGLA DE ORO: el HTML NO SE CACHEA. NUNCA. Esta app se renderiza en el servidor y cada
 * página lleva tu sesión dentro (tu nombre, en qué listas tienes cada título, tu progreso).
 * Guardar un documento aquí sería, en el mejor caso, enseñarte una lista vieja como si fuera
 * la buena, y en el peor servir la página de una sesión a otra. Por eso esto NO es el
 * `generateSW` con `navigateFallback` de una SPA: allí hay un `index.html` estático que vale
 * para todo el mundo, y aquí no existe tal cosa.
 *
 * Lo que sí se guarda, y por qué es seguro:
 *   · `/_astro/*`  — llevan hash en el nombre, así que son inmutables: cache-first para siempre.
 *   · `/js`, `/icons`, `/logos` y los PNG sueltos — sin hash, así que *stale-while-revalidate*:
 *     se sirve lo guardado y se refresca por detrás para la próxima.
 *   · `image.tmdb.org` — los pósters, que son el grueso del peso de la app. Con tope, que si no
 *     el catálogo entero acaba en el disco del móvil.
 *
 * Todo lo demás (incluido `/api/*`) va a la red sin que este archivo lo toque.
 *
 * Consecuencia honesta: sin conexión la app NO funciona, porque sin red no hay página. Lo único
 * que hace offline es enseñar `/offline.html` en vez del dinosaurio.
 */
const VERSION = 'yf-v1';
const ASSETS = `${VERSION}-assets`;
const IMAGES = `${VERSION}-tmdb`;
const OFFLINE_URL = '/offline.html';

/** Estáticos propios SIN hash en el nombre: hay que revalidarlos, no fijarlos para siempre. */
const REVALIDATE = /^\/(js|icons|logos)\/|^\/(favicon-32|apple-touch-icon|logo_yourfavs\d?)\.png$/;
/** Tope de pósters guardados. Cada uno pesa ~30-60KB, así que ~300 son unos 15MB. */
const IMAGES_MAX = 300;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(ASSETS);
        await cache.addAll([OFFLINE_URL, '/icons/icon-192.png']);
        // Sin esperar a que se cierren las pestañas: como no hay shell cacheada, no hay
        // riesgo de mezclar una versión nueva del SW con HTML viejo.
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([ASSETS, IMAGES]);
        for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
        await self.clients.claim();
    })());
});

/** Guardado válido: las respuestas opacas (TMDB, otro origen) no tienen `ok` pero sirven. */
function isCacheable(response) {
    return response && (response.ok || response.type === 'opaque');
}

/** Tira las entradas más viejas cuando la caché pasa del tope (FIFO por orden de inserción). */
async function trim(cacheName, max) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, max) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (isCacheable(response)) {
        await cache.put(request, response.clone());
        if (max) trim(cacheName, max);
    }
    return response;
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    const network = fetch(request)
        .then((response) => {
            if (isCacheable(response)) cache.put(request, response.clone());
            return response;
        })
        .catch(() => hit);
    return hit || network;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 1 · Navegación: a la red siempre. Si no hay red, la página de cortesía.
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }

    // 2 · Assets con hash de Astro: inmutables.
    if (url.origin === self.location.origin && url.pathname.startsWith('/_astro/')) {
        event.respondWith(cacheFirst(request, ASSETS));
        return;
    }

    // 3 · Estáticos propios sin hash.
    if (url.origin === self.location.origin && REVALIDATE.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, ASSETS));
        return;
    }

    // 4 · Pósters y fondos de TMDB.
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(cacheFirst(request, IMAGES, IMAGES_MAX));
        return;
    }

    // El resto no se toca: que lo resuelva el navegador como siempre.
});
