import { renderers } from './renderers.mjs';
import { s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_CvSoi7hX.mjs';
import { manifest } from './manifest_C6MRRS2Y.mjs';
import { createExports } from '@astrojs/netlify/ssr-function.js';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/404.astro.mjs');
const _page2 = () => import('./pages/about.astro.mjs');
const _page3 = () => import('./pages/actor/_actor_.astro.mjs');
const _page4 = () => import('./pages/busqueda.astro.mjs');
const _page5 = () => import('./pages/categorias.astro.mjs');
const _page6 = () => import('./pages/maspopulares.astro.mjs');
const _page7 = () => import('./pages/movie/_id_.astro.mjs');
const _page8 = () => import('./pages/personal.astro.mjs');
const _page9 = () => import('./pages/plataformas.astro.mjs');
const _page10 = () => import('./pages/serie/_id_.astro.mjs');
const _page11 = () => import('./pages/topmovies.astro.mjs');
const _page12 = () => import('./pages/topseries.astro.mjs');
const _page13 = () => import('./pages/ultimoslanzamientos.astro.mjs');
const _page14 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/generic.js", _page0],
    ["src/pages/404.astro", _page1],
    ["src/pages/about.astro", _page2],
    ["src/pages/actor/[actor].astro", _page3],
    ["src/pages/busqueda.astro", _page4],
    ["src/pages/categorias.astro", _page5],
    ["src/pages/maspopulares.astro", _page6],
    ["src/pages/movie/[id].astro", _page7],
    ["src/pages/personal.astro", _page8],
    ["src/pages/plataformas.astro", _page9],
    ["src/pages/serie/[id].astro", _page10],
    ["src/pages/topmovies.astro", _page11],
    ["src/pages/topseries.astro", _page12],
    ["src/pages/ultimoslanzamientos.astro", _page13],
    ["src/pages/index.astro", _page14]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./_noop-actions.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "middlewareSecret": "8c1ae381-5358-4016-92e6-e60dd8d7630a"
};
const _exports = createExports(_manifest, _args);
const __astrojsSsrVirtualEntry = _exports.default;
const _start = 'start';
if (_start in serverEntrypointModule) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { __astrojsSsrVirtualEntry as default, pageMap };
