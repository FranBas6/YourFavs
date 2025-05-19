/* empty css                                 */
import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, r as renderTemplate, k as renderComponent } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
import { $ as $$CardMovie } from '../chunks/CardMovie_DG0ROOzd.mjs';
import { $ as $$CardSerie } from '../chunks/CardSerie_CpvdphiE.mjs';
import { c as getNetflixSeries, d as getAmazonPrimeSeries, e as getDisneyPlusSeries, f as getHBOMaxSeries, h as getAppleTVSeries, i as getMovistarPlusSeries, j as getFilminSeries } from '../chunks/yourfavsSerie_BwU6ZL0r.mjs';
import { j as getNetflixMovies, k as getAmazonPrimeMovies, l as getDisneyPlusMovies, m as getHBOMaxMovies, n as getAppleTVMovies, o as getMovistarPlusMovies, p as getFilminMovies } from '../chunks/yourfavsMovie_CLbWrIZn.mjs';
/* empty css                                       */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Plataformas$1 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Plataformas$1;
  const urlParams = new URL(Astro2.url, Astro2.request.url).searchParams;
  const page = Number(urlParams.get("page")) || 1;
  const pageStr = page.toString();
  const platformParam = urlParams.get("platform") || "all";
  const sortBy = urlParams.get("sortBy") || "popularity";
  const sortByS = sortBy;
  const sortByM = sortBy;
  const sortOrder = "desc";
  const platforms = [
    { id: "netflix", name: "Netflix", logo: "/logos/netflix.svg" },
    { id: "amazon", name: "Amazon Prime", logo: "/logos/amazon.svg" },
    { id: "disney", name: "Disney+", logo: "/logos/disney.svg" },
    { id: "hbo", name: "HBO Max", logo: "/logos/hbo.svg" },
    { id: "apple", name: "Apple TV+", logo: "/logos/apple.svg" },
    { id: "movistar", name: "Movistar+", logo: "/logos/movistar.svg" },
    { id: "filmin", name: "Filmin", logo: "/logos/filmin.svg" }
  ];
  const sortOptions = [
    { id: "popularity", name: "Popularidad" },
    { id: "vote_average", name: "Puntuaci\xF3n" },
    { id: "first_air_date", name: "Fecha de estreno" }
  ];
  let movies = [];
  let series = [];
  function removeDuplicates(items) {
    const uniqueMap = /* @__PURE__ */ new Map();
    items.forEach((item) => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });
    return Array.from(uniqueMap.values());
  }
  if (platformParam === "all") {
    const netflixSeries = await getNetflixSeries(pageStr, sortByS, sortOrder);
    const netflixMovies = await getNetflixMovies(pageStr, sortByM, sortOrder);
    const amazonPrimeSeries = await getAmazonPrimeSeries(pageStr, sortByS, sortOrder);
    const amazonPrimeMovies = await getAmazonPrimeMovies(pageStr, sortByM, sortOrder);
    const disneyPlusSeries = await getDisneyPlusSeries(pageStr, sortByS, sortOrder);
    const disneyPlusMovies = await getDisneyPlusMovies(pageStr, sortByM, sortOrder);
    const hboMaxSeries = await getHBOMaxSeries(pageStr, sortByS, sortOrder);
    const hboMaxMovies = await getHBOMaxMovies(pageStr, sortByM, sortOrder);
    const appleTVSeries = await getAppleTVSeries(pageStr, sortByS, sortOrder);
    const appleTVMovies = await getAppleTVMovies(pageStr, sortByM, sortOrder);
    const movistarPlusSeries = await getMovistarPlusSeries(pageStr, sortByS, sortOrder);
    const movistarPlusMovies = await getMovistarPlusMovies(pageStr, sortByM, sortOrder);
    const filminSeries = await getFilminSeries(pageStr, sortByS, sortOrder);
    const filminMovies = await getFilminMovies(pageStr, sortByM, sortOrder);
    const allMovies = [
      ...netflixMovies,
      ...amazonPrimeMovies,
      ...disneyPlusMovies,
      ...hboMaxMovies,
      ...appleTVMovies,
      ...movistarPlusMovies,
      ...filminMovies
    ];
    const allSeries = [
      ...netflixSeries,
      ...amazonPrimeSeries,
      ...disneyPlusSeries,
      ...hboMaxSeries,
      ...appleTVSeries,
      ...movistarPlusSeries,
      ...filminSeries
    ];
    movies = removeDuplicates(allMovies);
    series = removeDuplicates(allSeries);
    if (sortByM === "popularity") {
      movies.sort((a, b) => b.popularity - a.popularity);
    } else if (sortByM === "vote_average") {
      movies.sort((a, b) => b.vote_average - a.vote_average);
    } else if (sortByM === "release_date") {
      movies.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());
    } else if (sortByM === "title") {
      movies.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortByS === "popularity") {
      series.sort((a, b) => b.popularity - a.popularity);
    } else if (sortByS === "vote_average") {
      series.sort((a, b) => b.vote_average - a.vote_average);
    } else if (sortByS === "first_air_date") {
      series.sort((a, b) => new Date(b.first_air_date).getTime() - new Date(a.first_air_date).getTime());
    } else if (sortByS === "name") {
      series.sort((a, b) => a.name.localeCompare(b.name));
    }
  } else {
    switch (platformParam) {
      case "netflix":
        movies = await getNetflixMovies(pageStr, sortByM, sortOrder);
        series = await getNetflixSeries(pageStr, sortByS, sortOrder);
        break;
      case "amazon":
        movies = await getAmazonPrimeMovies(pageStr, sortByM, sortOrder);
        series = await getAmazonPrimeSeries(pageStr, sortByS, sortOrder);
        break;
      case "disney":
        movies = await getDisneyPlusMovies(pageStr, sortByM, sortOrder);
        series = await getDisneyPlusSeries(pageStr, sortByS, sortOrder);
        break;
      case "hbo":
        movies = await getHBOMaxMovies(pageStr, sortByM, sortOrder);
        series = await getHBOMaxSeries(pageStr, sortByS, sortOrder);
        break;
      case "apple":
        movies = await getAppleTVMovies(pageStr, sortByM, sortOrder);
        series = await getAppleTVSeries(pageStr, sortByS, sortOrder);
        break;
      case "movistar":
        movies = await getMovistarPlusMovies(pageStr, sortByM, sortOrder);
        series = await getMovistarPlusSeries(pageStr, sortByS, sortOrder);
        break;
      case "filmin":
        movies = await getFilminMovies(pageStr, sortByM, sortOrder);
        series = await getFilminSeries(pageStr, sortByS, sortOrder);
        break;
    }
  }
  function createUrlWithParams(newParams) {
    const currentParams = new URLSearchParams(urlParams);
    Object.entries(newParams).forEach(([key, value]) => {
      currentParams.set(key, value);
    });
    if (newParams.sortBy || newParams.platform) {
      currentParams.set("page", "1");
    }
    return `?${currentParams.toString()}`;
  }
  function getGenreName(id) {
    const genres = {
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
      10752: "Guerra",
      37: "Western"
    };
    return genres[id] || "Desconocido";
  }
  const totalPages = 190;
  return renderTemplate`${maybeRenderHead()}<section class="container mx-auto px-4 py-4"> <header class="mb-8"> <h1 class="text-coral-red font-bold text-4xl md:text-5xl lg:text-6xl text-center mb-2">
PLATAFORMAS
</h1> <div class="w-24 h-1 bg-coral-red mx-auto rounded-full mb-4"></div> <p class="text-gray-600 text-center max-w-2xl mx-auto">
Descubre las películas y series disponibles en tus plataformas favoritas
</p> </header> <!-- Filtro de Plataformas --> <div class="mb-6"> <h3 class="text-lg font-medium mb-3 text-gray-700">Selecciona una plataforma:</h3> <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3"> <a${addAttribute(createUrlWithParams({ platform: "all" }), "href")}${addAttribute(`flex flex-col items-center p-3 rounded-lg border ${platformParam === "all" ? "border-ice-blue bg-ice-blue text-white" : "border-gray-300 hover:bg-gray-50 text-gray-700"} transition-all`, "class")}> <span class="font-medium">Todas</span> </a> ${platforms.map((platform) => renderTemplate`<a${addAttribute(createUrlWithParams({ platform: platform.id }), "href")}${addAttribute(`flex flex-col items-center p-3 rounded-lg border ${platformParam === platform.id ? "border-ice-blue bg-ice-blue text-white" : "border-gray-300 hover:bg-gray-50 text-gray-700"} transition-all`, "class")}> <div class="w-8 h-8 mb-2"> <img${addAttribute(platform.logo, "src")}${addAttribute(platform.name, "alt")} class="w-full h-full object-contain"> </div> <span class="font-medium text-sm text-center">${platform.name}</span> </a>`)} </div> </div> <!-- Opciones de ordenación con botones --> <div class="mb-6 bg-white p-4 rounded-lg shadow-md"> <h3 class="text-lg font-medium mb-3 text-gray-700">Ordenar por:</h3> <!-- Criterios de ordenación --> <div class="mb-4"> <p class="block text-sm font-medium text-gray-700 mb-2">Criterio:</p> <div class="flex flex-wrap gap-2"> ${sortOptions.map((option) => renderTemplate`<a${addAttribute(createUrlWithParams({ sortBy: option.id }), "href")}${addAttribute(`px-3 py-2 rounded-md text-sm font-medium transition-colors ${sortBy === option.id ? "bg-coral-red text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`, "class")}> ${option.name} </a>`)} </div> </div> </div> <!-- Paginación Mejorada para Móviles --> <nav aria-label="Paginación" class="flex items-center justify-center mb-8"> <!-- En pantallas pequeñas (móviles) - Diseño vertical compacto --> <div class="flex flex-col w-full max-w-xs gap-2 p-2 bg-white rounded-lg shadow-md sm:hidden"> <div class="flex justify-center items-center px-2 py-1"> <span class="font-medium text-gray-700 text-sm">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold text-sm">${page}</span> <span class="font-medium text-gray-700 text-sm">de ${totalPages}</span> </div> <div class="grid grid-cols-2 gap-2"> <a${addAttribute(createUrlWithParams({ page: Math.max(1, page - 1).toString() }), "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <a${addAttribute(createUrlWithParams({ page: Math.min(totalPages, page + 1).toString() }), "href")}${addAttribute(`px-3 py-2 rounded-lg transition-all duration-300 flex items-center justify-center text-sm ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </div> <!-- En pantallas medianas y grandes - Diseño horizontal --> <div class="hidden sm:flex items-center space-x-2 bg-white p-2 rounded-lg shadow-md"> <a${addAttribute(createUrlWithParams({ page: Math.max(1, page - 1).toString() }), "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === 1 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === 1, "aria-disabled")}> <span class="mr-1">←</span> Anterior
</a> <div class="flex items-center px-4"> <span class="font-medium text-gray-700">Página</span> <span class="mx-2 px-3 py-1 bg-coral-red text-white rounded-md font-bold">${page}</span> <span class="font-medium text-gray-700">de ${totalPages}</span> </div> <a${addAttribute(createUrlWithParams({ page: Math.min(totalPages, page + 1).toString() }), "href")}${addAttribute(`px-4 py-2 rounded-lg transition-all duration-300 flex items-center ${page === totalPages ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"}`, "class")}${addAttribute(page === totalPages, "aria-disabled")}>
Siguiente <span class="ml-1">→</span> </a> </div> </nav> <!-- Título de plataforma seleccionada y criterio de ordenación --> <div class="mb-6"> ${platformParam !== "all" && renderTemplate`<h2 class="text-2xl font-bold text-center text-gray-700 mb-2">
Contenido de ${platforms.find((p) => p.id === platformParam)?.name || ""} </h2>`} ${platformParam === "all" && renderTemplate`<h2 class="text-2xl font-bold text-center text-gray-700 mb-2">
Contenido de todas las plataformas
</h2>`} <p class="text-center text-gray-600">
Ordenado por <span class="font-medium">${sortOptions.find((o) => o.id === sortBy)?.name || "Popularidad"}</span>
en orden descendente
</p> ${platformParam === "all" && renderTemplate`<p class="text-center text-gray-600 mt-2"> <span class="font-medium">Contenido deduplicado:</span> Cada película o serie aparece solo una vez
</p>`} </div> <!-- Sección de Películas --> ${movies.length > 0 && renderTemplate`<section class="mb-10"> <h2 class="text-coral-red py-3 font-bold mb-4 text-2xl md:text-3xl flex items-center"> <span class="mr-2"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h18M3 16h18"></path> </svg> </span>
PELÍCULAS
</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 w-full transition-all duration-300"> ${movies.map((item) => renderTemplate`<div class="card-wrapper transform hover:scale-105 transition-transform duration-200"> ${renderComponent($$result, "CardMovie", $$CardMovie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "title": item.title, "vote_average": item.vote_average, "overview": item.overview, "release_date": item.release_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers })} </div>`)} </div> </section>`} <!-- Sección de Series --> ${series.length > 0 && renderTemplate`<section class="mb-10"> <h2 class="text-coral-red py-3 font-bold mb-4 text-2xl md:text-3xl flex items-center"> <span class="mr-2"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path> </svg> </span>
SERIES
</h2> <div class="grid gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 w-full transition-all duration-300"> ${series.map((item) => renderTemplate`<div class="card-wrapper transform hover:scale-105 transition-transform duration-200"> ${renderComponent($$result, "CardSerie", $$CardSerie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "name": item.name, "vote_average": item.vote_average, "overview": item.overview, "first_air_date": item.first_air_date, "seasons": item.seasons, "last_episode_to_air": item.last_episode_to_air, "next_episode_to_air": item.next_episode_to_air, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "status": item.status })} </div>`)} </div> </section>`} <!-- Mensaje cuando no hay resultados --> ${movies.length === 0 && series.length === 0 && renderTemplate`<div class="text-center py-12"> <h3 class="text-2xl font-medium mb-2 text-gray-700">No se encontraron resultados</h3> <p class="text-gray-600">Intenta con otra plataforma o página</p> </div>`} <!-- Paginación inferior --> <div class="mt-12 flex justify-center"> <div class="inline-flex rounded-md shadow-sm"> ${page > 2 && renderTemplate`<a${addAttribute(createUrlWithParams({ page: "1" }), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-l-lg">
1
</a>`} ${page > 3 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page > 1 && renderTemplate`<a${addAttribute(createUrlWithParams({ page: (page - 1).toString() }), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page - 1} </a>`} <a${addAttribute(createUrlWithParams({ page: page.toString() }), "href")} class="px-3 py-2 bg-coral-red text-white border border-coral-red"> ${page} </a> ${page < totalPages && renderTemplate`<a${addAttribute(createUrlWithParams({ page: (page + 1).toString() }), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"> ${page + 1} </a>`} ${page < totalPages - 2 && renderTemplate`<span class="px-3 py-2 bg-white text-gray-700 border-t border-b border-gray-300">
...
</span>`} ${page < totalPages - 1 && renderTemplate`<a${addAttribute(createUrlWithParams({ page: totalPages.toString() }), "href")} class="px-3 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-r-lg"> ${totalPages} </a>`} </div> </div> </section> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/Plataformas.astro", void 0);

const $$Plataformas = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Plataformas" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Plataformas", $$Plataformas$1, {})} ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/plataformas.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/plataformas.astro";
const $$url = "/plataformas";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Plataformas,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
