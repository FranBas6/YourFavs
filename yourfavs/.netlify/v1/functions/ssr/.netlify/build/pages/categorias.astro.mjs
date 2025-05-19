/* empty css                                 */
import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
import { $ as $$CardMovie } from '../chunks/CardMovie_DG0ROOzd.mjs';
import { a as getMoviesByCategory } from '../chunks/yourfavsMovie_CLbWrIZn.mjs';
import { a as getSeriesByCategory } from '../chunks/yourfavsSerie_BwU6ZL0r.mjs';
import { $ as $$CardSerie } from '../chunks/CardSerie_CpvdphiE.mjs';
/* empty css                                      */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Categorias$1 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Categorias$1;
  const url = new URL(Astro2.request.url);
  const page = Number(url.searchParams.get("page") || 1);
  const category = url.searchParams.get("categoria") || "proximamente";
  const latestMovies = await getMoviesByCategory(category, page.toString());
  const latestSeries = await getSeriesByCategory(category, page.toString());
  const totalPages = 190;
  const formattedCategory = category.replace(/_/g, " ");
  console.log("Categor\xEDa seleccionada:", category);
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
  function generateUrl(newCategory, newPage = 1) {
    const newParams = new URLSearchParams();
    newParams.set("categoria", newCategory || category);
    newParams.set("page", newPage.toString());
    return `?${newParams.toString()}`;
  }
  return renderTemplate`<!-- Checkbox to control the visibility of the menu on mobile -->${maybeRenderHead()}<input type="checkbox" id="nav-togglee" class="hidden"> <!-- Label that acts as a button to toggle the menu --> <label for="nav-togglee" class="cursor-pointer md:hidden block text-white bg-dark-blue rounded-md px-4 py-2 mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"></label> <nav class="flex flex-col items-center justify-center w-full rounded-b-xl bg-dark-blue text-center md:flex-row md:flex-wrap sticky-navi hidden md:flex" id="nav-menuu"> <a${addAttribute(generateUrl("accion"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "accion" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Acción</a> <a${addAttribute(generateUrl("comedia"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "comedia" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Comedia</a> <a${addAttribute(generateUrl("drama"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "drama" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Drama</a> <a${addAttribute(generateUrl("crimen"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "crimen" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Crimen</a> <a${addAttribute(generateUrl("aventura"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "aventura" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Aventura</a> <a${addAttribute(generateUrl("fantasia"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "fantasia" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Fantasía</a> <a${addAttribute(generateUrl("ciencia_ficcion"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "ciencia_ficcion" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Ciencia
        Ficción</a> <a${addAttribute(generateUrl("misterio"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "misterio" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Misterio</a> <a${addAttribute(generateUrl("terror"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "terror" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Terror</a> <a${addAttribute(generateUrl("animacion"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "animacion" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Animación</a> <a${addAttribute(generateUrl("familia"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "familia" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Familia</a> <a${addAttribute(generateUrl("proximamente"), "href")}${addAttribute(`px-4 py-2 text-white hover:bg-blue-700 focus:outline-none ${category === "proximamente" ? "font-bold border-b-2 border-coral-red" : ""}`, "class")}>Proximamente</a> </nav> <h1 class="text-coral-red py-3 px-4 font-bold mt-2 text-3xl sm:text-3xl md:text-4xl lg:text-5xl w-full text-center relative"> ${formattedCategory.toUpperCase()} </h1> <!-- Paginación Mejorada para Móviles --> <nav aria-label="Paginación" class="flex items-center justify-center mb-8"> <!-- En pantallas pequeñas (móviles) - Diseño vertical compacto --> <div class="flex flex-col w-full max-w-xs gap-2 p-2 bg-white rounded-lg shadow-md sm:hidden"> <div class="flex justify-center items-center px-2 py-1"> <span class="font-medium text-gray-700 text-sm">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold text-sm">${page}</span> <span class="font-medium text-gray-700 text-sm">de ${totalPages}</span> </div> <div class="grid grid-cols-2 gap-2"> <a${addAttribute(generateUrl(category, Math.max(1, page - 1)), "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <a${addAttribute(generateUrl(category, Math.min(totalPages, page + 1)), "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </div> <!-- En pantallas medianas y grandes - Diseño horizontal --> <div class="hidden sm:flex items-center space-x-2 bg-white p-2 rounded-lg shadow-md"> <a${addAttribute(generateUrl(category, Math.max(1, page - 1)), "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <div class="flex items-center px-4"> <span class="font-medium text-gray-700">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold">${page}</span> <span class="font-medium text-gray-700">de ${totalPages}</span> </div> <a${addAttribute(generateUrl(category, Math.min(totalPages, page + 1)), "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </nav> <h2 class="text-coral-red py-3 px-4 font-bold mb-1 text-3xl">PELICULAS</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 w-full"> ${latestMovies.map((item) => renderTemplate`${renderComponent($$result, "CardMovie", $$CardMovie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "title": item.title, "vote_average": item.vote_average, "overview": item.overview, "release_date": item.release_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers })}`)} </div> <h2 class="text-coral-red py-3 px-4 font-bold mb-1 text-3xl">SERIES</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 w-full"> ${latestSeries.map((item) => renderTemplate`${renderComponent($$result, "CardSerie", $$CardSerie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "name": item.name, "vote_average": item.vote_average, "overview": item.overview, "first_air_date": item.first_air_date, "seasons": item.seasons, "last_episode_to_air": item.last_episode_to_air, "next_episode_to_air": item.next_episode_to_air, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "status": item.status })}`)} </div> <div class="mt-12 flex justify-center"> <div class="inline-flex rounded-md shadow-sm"> ${page > 2 && renderTemplate`<a${addAttribute(generateUrl(category, 1), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-l-lg">
1
</a>`} ${page > 3 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page > 1 && renderTemplate`<a${addAttribute(generateUrl(category, page - 1), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page - 1} </a>`} <a${addAttribute(generateUrl(category, page), "href")} class="px-3 py-2 bg-coral-red text-white border border-coral-red"> ${page} </a> ${page < totalPages && renderTemplate`<a${addAttribute(generateUrl(category, page + 1), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page + 1} </a>`} ${page < totalPages - 2 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page < totalPages - 1 && renderTemplate`<a${addAttribute(generateUrl(category, totalPages), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-r-lg"> ${totalPages} </a>`} </div> </div> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/Categorias.astro", void 0);

const $$Categorias = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Categorias" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Categorias", $$Categorias$1, {})} ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/categorias.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/categorias.astro";
const $$url = "/categorias";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Categorias,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
