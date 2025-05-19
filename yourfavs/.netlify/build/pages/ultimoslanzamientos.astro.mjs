/* empty css                                 */
import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
import { $ as $$CardMovie } from '../chunks/CardMovie_DG0ROOzd.mjs';
import { $ as $$CardSerie } from '../chunks/CardSerie_CpvdphiE.mjs';
import { r as getLatestMovies } from '../chunks/yourfavsMovie_CLbWrIZn.mjs';
import { s as getLatestSeries } from '../chunks/yourfavsSerie_BwU6ZL0r.mjs';
/* empty css                                               */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$UltimosLanzamientos = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$UltimosLanzamientos;
  const page = Number(Astro2.request.url.split("?page=")[1] || 1);
  const latestMovies = await getLatestMovies({ page: page.toString() });
  const latestSeries = await getLatestSeries({ page: page.toString() });
  const totalPages = 190;
  const genresMap = {
    // Géneros de películas y series
    28: "Acci\xF3n",
    12: "Aventura",
    16: "Animaci\xF3n",
    35: "Comedia",
    80: "Crimen",
    99: "Documental",
    18: "Drama",
    10751: "Familia",
    14: "Fantas\xEDa",
    36: "Historia",
    27: "Terror",
    10402: "M\xFAsica",
    9648: "Misterio",
    10749: "Romance",
    878: "Ciencia ficci\xF3n",
    10770: "Pel\xEDcula de TV",
    53: "Thriller",
    10752: "B\xE9lica",
    37: "Western",
    // Géneros exclusivos de series
    10759: "Acci\xF3n y Aventura",
    10762: "Infantil",
    10763: "Noticias",
    10764: "Reality",
    10765: "Sci-Fi y Fantas\xEDa",
    10766: "Soap",
    10767: "Talk",
    10768: "Guerra y Pol\xEDtica"
  };
  function getGenreName(id) {
    return genresMap[id] || "Otro";
  }
  return renderTemplate`${maybeRenderHead()}<section class="container mx-auto px-4 py-4"> <header class="mb-8"> <h1 class="text-coral-red font-bold text-4xl md:text-5xl lg:text-6xl text-center mb-2">
ÚLTIMOS LANZAMIENTOS
</h1> <div class="w-24 h-1 bg-coral-red mx-auto rounded-full mb-4"></div> <p class="text-gray-600 text-center max-w-2xl mx-auto">
Descubre las últimas películas y series
</p> </header> <!-- Paginación Mejorada para Móviles --> <nav aria-label="Paginación" class="flex items-center justify-center mb-8"> <!-- En pantallas pequeñas (móviles) - Diseño vertical compacto --> <div class="flex flex-col w-full max-w-xs gap-2 p-2 bg-white rounded-lg shadow-md sm:hidden"> <div class="flex justify-center items-center px-2 py-1"> <span class="font-medium text-gray-700 text-sm">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold text-sm">${page}</span> <span class="font-medium text-gray-700 text-sm">de ${totalPages}</span> </div> <div class="grid grid-cols-2 gap-2"> <a${addAttribute(`?page=${Math.max(1, page - 1)}`, "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <a${addAttribute(`?page=${Math.min(totalPages, page + 1)}`, "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </div> <!-- En pantallas medianas y grandes - Diseño horizontal --> <div class="hidden sm:flex items-center space-x-2 bg-white p-2 rounded-lg shadow-md"> <a${addAttribute(`?page=${Math.max(1, page - 1)}`, "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <div class="flex items-center px-4"> <span class="font-medium text-gray-700">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold">${page}</span> <span class="font-medium text-gray-700">de ${totalPages}</span> </div> <a${addAttribute(`?page=${Math.min(totalPages, page + 1)}`, "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </nav> <!-- Sección de Películas --> <section class="mb-10"> <h2 class="text-coral-red py-3 font-bold mb-4 text-2xl md:text-3xl flex items-center"> <span class="mr-2"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h18M3 16h18"></path> </svg> </span>
PELÍCULAS
</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 w-full transition-all duration-300"> ${latestMovies.map((item) => renderTemplate`<div class="card-wrapper transform hover:scale-105 transition-transform duration-200"> ${renderComponent($$result, "CardMovie", $$CardMovie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "title": item.title, "vote_average": item.vote_average, "overview": item.overview, "release_date": item.release_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers })} </div>`)} </div> </section> <!-- Sección de Series --> <section class="mb-10"> <h2 class="text-coral-red py-3 font-bold mb-4 text-2xl md:text-3xl flex items-center"> <span class="mr-2"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path> </svg> </span>
SERIES
</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 w-full transition-all duration-300"> ${latestSeries.map((item) => renderTemplate`<div class="card-wrapper transform hover:scale-105 transition-transform duration-200"> ${renderComponent($$result, "CardSerie", $$CardSerie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "name": item.name, "vote_average": item.vote_average, "overview": item.overview, "first_air_date": item.first_air_date, "seasons": item.seasons, "last_episode_to_air": item.last_episode_to_air, "next_episode_to_air": item.next_episode_to_air, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "status": item.status })} </div>`)} </div> </section> <div class="mt-12 flex justify-center"> <div class="inline-flex rounded-md shadow-sm"> ${page > 2 && renderTemplate`<a href="?page=1" class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-l-lg">
1
</a>`} ${page > 3 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page > 1 && renderTemplate`<a${addAttribute(`?page=${page - 1}`, "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page - 1} </a>`} <a${addAttribute(`?page=${page}`, "href")} class="px-3 py-2 bg-coral-red text-white border border-coral-red"> ${page} </a> ${page < totalPages && renderTemplate`<a${addAttribute(`?page=${page + 1}`, "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page + 1} </a>`} ${page < totalPages - 2 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page < totalPages - 1 && renderTemplate`<a${addAttribute(`?page=${totalPages}`, "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-r-lg"> ${totalPages} </a>`} </div> </div> </section> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/UltimosLanzamientos.astro", void 0);

const $$Ultimoslanzamientos = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "\xDAltimos Lanzamientos" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "UltimosLanzamientos", $$UltimosLanzamientos, {})} ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/ultimoslanzamientos.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/ultimoslanzamientos.astro";
const $$url = "/ultimoslanzamientos";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Ultimoslanzamientos,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
