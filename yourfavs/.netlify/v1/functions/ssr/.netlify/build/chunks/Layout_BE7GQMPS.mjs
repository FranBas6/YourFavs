import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, l as renderSlot, r as renderTemplate, k as renderComponent, o as renderScript, p as renderHead } from './astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import 'clsx';
/* empty css                         */

const $$Astro$2 = createAstro();
const $$HeaderButton = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$HeaderButton;
  const { href, active } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<a${addAttribute(href, "href")}${addAttribute(`flex items-center justify-center text-white cursor-pointer 
  rounded-lg px-6 py-3 font-semibold text-lg transition-all duration-300
  hover:bg-coral-red hover:shadow-lg hover:scale-105
  focus:ring-2 focus:outline-none focus:ring-white/30
  ${active ? "bg-coral-red/80" : "opacity-85 hover:opacity-100"}`, "class")}> ${renderSlot($$result, $$slots["before"])} ${renderSlot($$result, $$slots["default"])} ${renderSlot($$result, $$slots["after"])} </a> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/HeaderButton.astro", void 0);

const $$Header = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<header class="py-3 px-5 mx-auto w-full lg:py-10 lg:px-16 bg-gradient-to-r from-blue-600 to-blue-500 rounded-b-2xl shadow-lg"> <div class="title-container"> <h1 class="mb-3 text-4xl tracking-tight font-extrabold text-white animated-text title-3d" data-text="YourFavs">
YourFavs
</h1> </div> <!-- Checkbox oculto para controlar la visibilidad del menú en móviles --> <input type="checkbox" id="nav-toggle" class="hidden"> <!-- Label que actúa como botón para alternar el menú --> <label for="nav-toggle" class="cursor-pointer md:hidden flex items-center justify-center mx-auto text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 mt-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors duration-300 shadow-md w-32"> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path> </svg>
MENÚ
</label> <!-- Nav con Sticky --> <nav class="flex flex-col items-center justify-center w-full rounded-xl bg-transparent text-center md:flex-row sticky-nav hidden md:flex" id="nav-menu"> ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/ultimoslanzamientos" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" stroke-width="2"> <path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3"></path> <path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3"></path> <path d="M15 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"></path> </svg>
Últimos Lanzamientos
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/maspopulares" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" stroke-width="2"> <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"></path> </svg>
Más Populares
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/topmovies" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width="20" height="20" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke="currentColor"> <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path> <path d="M8 4l0 16"></path> <path d="M16 4l0 16"></path> <path d="M4 8l4 0"></path> <path d="M4 16l4 0"></path> <path d="M4 12l16 0"></path> <path d="M16 8l4 0"></path> <path d="M16 16l4 0"></path> </svg>
Películas
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/topseries" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" stroke-width="2"> <path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"></path> <path d="M16 3l-4 4l-4 -4"></path> </svg>
Series
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/plataformas" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z"></path> <path d="M10 9l5 3l-5 3z"></path> </svg>
Plataformas
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/categorias" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" stroke-width="2"> <path d="M4 4h6v6h-6z"></path> <path d="M14 4h6v6h-6z"></path> <path d="M4 14h6v6h-6z"></path> <path d="M17 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"></path> </svg>
Categorías
` })} ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/personal" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width="24" height="24" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke="currentColor"> <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path> <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"></path> </svg>
Personal
` })} <div class="flex items-center mt-3 md:mt-0 md:ml-2"> <form action="/busqueda" method="get" class="flex items-center"> <input name="query" type="text" placeholder="Buscar..." class="w-52 md:w-64 px-4 py-2 rounded-l-lg border-0 bg-white/80 text-black focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-inner"> <button type="submit" class="px-4 py-2 rounded-r-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors duration-300 shadow-sm"> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path> </svg> </button> </form> </div> ${renderComponent($$result, "HeaderButton", $$HeaderButton, { "href": "/about" }, { "default": ($$result2) => renderTemplate` <svg class="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path> <path d="M12 9h.01"></path> <path d="M11 12h1v4h1"></path> </svg>
Yourfavs
` })} </nav> </header> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/Header.astro", void 0);

const $$Astro$1 = createAstro();
const $$ClientRouter = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$ClientRouter;
  const { fallback = "animate" } = Astro2.props;
  return renderTemplate`<meta name="astro-view-transitions-enabled" content="true"><meta name="astro-view-transitions-fallback"${addAttribute(fallback, "content")}>${renderScript($$result, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/node_modules/astro/components/ClientRouter.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/node_modules/astro/components/ClientRouter.astro", void 0);

const $$Astro = createAstro();
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Layout;
  const { title, description = "Tu plataforma favorita para descubrir pel\xEDculas y series" } = Astro2.props;
  return renderTemplate`<html lang="es"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="generator"${addAttribute(Astro2.generator, "content")}><meta name="description"${addAttribute(description, "content")}><meta name="theme-color" content="#3B82F6"><meta property="og:title"${addAttribute(title, "content")}><meta property="og:description"${addAttribute(description, "content")}><meta property="og:type" content="website"><title>${title}</title>${renderComponent($$result, "ViewTransitions", $$ClientRouter, {})}${renderHead()}</head> <body class="bg-light-gray min-h-screen pb-16 sm:pb-24 md:pb-32 font-poppins"> ${renderComponent($$result, "Header", $$Header, {})} <main class="max-w-7xl w-full px-3 sm:px-6 lg:px-8 mx-auto pt-4 sm:pt-6 md:pt-8 lg:pt-10"> ${renderSlot($$result, $$slots["default"])} </main> <footer class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-8 sm:mt-12 md:mt-16 pb-4 sm:pb-6 md:pb-8 text-center text-xs sm:text-sm text-gray-500"> <p>&copy; ${(/* @__PURE__ */ new Date()).getFullYear()} YourFavs. Todos los derechos reservados.</p> </footer> </body></html>`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/layouts/Layout.astro", void 0);

export { $$Layout as $ };
