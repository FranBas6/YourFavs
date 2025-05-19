/* empty css                                 */
import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, r as renderTemplate, l as renderSlot, k as renderComponent } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
import { $ as $$CardMovie } from '../chunks/CardMovie_DG0ROOzd.mjs';
import { $ as $$CardSerie } from '../chunks/CardSerie_CpvdphiE.mjs';
import 'clsx';
/* empty css                                    */
import { g as getMoviesByTitle } from '../chunks/yourfavsMovie_CLbWrIZn.mjs';
import { g as getSeriesByTitle } from '../chunks/yourfavsSerie_BwU6ZL0r.mjs';
import { c as getActorsByName } from '../chunks/yourfavsActor_CjtWvdYy.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro$2 = createAstro();
const $$CardActor = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$CardActor;
  const {
    nombre,
    imagen,
    popularidad,
    id,
    biografia,
    lugarNacimiento,
    fechaNacimiento
  } = Astro2.props;
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" });
  };
  const calculateAge = (birthday) => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = /* @__PURE__ */ new Date();
    let age2 = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || m === 0 && today.getDate() < birthDate.getDate()) {
      age2--;
    }
    return age2;
  };
  const placeholderImg = "/placeholder-actor.jpg";
  const isPopular = popularidad >= 15;
  const getPopularityColor = (pop) => {
    if (pop >= 20) return "bg-emerald-500 text-white";
    if (pop >= 15) return "bg-green-500 text-white";
    if (pop >= 10) return "bg-yellow-500 text-gray-900";
    if (pop >= 5) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
  };
  const age = calculateAge(fechaNacimiento);
  return renderTemplate`${maybeRenderHead()}<div class="media-card group" data-astro-cid-36f73x6d> <a${addAttribute(`/actor/${nombre}`, "href")} class="rounded-lg overflow-hidden shadow-xl bg-midnight-blue hover:scale-105 hover:bg-dark-blue transition duration-300 flex flex-col h-full border border-transparent hover:border-coral-plat relative will-change-transform" data-astro-cid-36f73x6d> <!-- Popular Badge --> ${isPopular && renderTemplate`<div class="absolute top-0 left-0 z-10 m-3" data-astro-cid-36f73x6d> <div class="badge bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center" data-astro-cid-36f73x6d> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-36f73x6d> <path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05c-.867 1.5-1.048 3.11-.967 4.652a.75.75 0 01.551.755c-.03.75.232 1.45.732 1.952.5.502 1.202.763 1.95.732.75.032 1.45-.232 1.952-.732.5-.5.764-1.202.732-1.952a.75.75 0 01.551-.755c.08-.246.176-.486.286-.72.284-.54.64-1.06 1.07-1.518.44-.467.96-.867 1.59-1.117.63-.25 1.34-.324 2.09-.224.51.07.826-.544.63-1.01-.327-.76-.902-1.397-1.673-1.874a6.17 6.17 0 00-2.148-.902C12.878 2.55 12.63 2.535 12.395 2.553z" clip-rule="evenodd" data-astro-cid-36f73x6d></path> </svg>
POPULAR
</div> </div>`} <div class="relative overflow-hidden" data-astro-cid-36f73x6d> <!-- Actor Image --> <img class="w-full h-64 md:h-72 object-cover rounded-t-lg transition-transform duration-500 group-hover:scale-110"${addAttribute(imagen || placeholderImg, "src")}${addAttribute(`Foto de ${nombre}`, "alt")} loading="lazy"${addAttribute(`this.onerror=null; this.src='${placeholderImg}'`, "onerror")} data-astro-cid-36f73x6d> <div${addAttribute(`rating-badge ${getPopularityColor(popularidad)} flex items-center justify-center shadow-lg`, "class")} data-astro-cid-36f73x6d> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-36f73x6d> <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" data-astro-cid-36f73x6d></path> </svg> <span class="font-semibold" data-astro-cid-36f73x6d>${popularidad ? popularidad.toFixed(1) : "N/A"}</span> </div> <!-- Gradient Overlay --> <div class="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-dark-blue via-dark-blue/80 to-transparent" data-astro-cid-36f73x6d></div> </div> <div class="p-4 sm:p-5 flex-grow flex flex-col" data-astro-cid-36f73x6d> <!-- Name --> <h2 class="text-lg sm:text-xl font-bold tracking-tight text-coral-plat leading-tight mb-2 line-clamp-2" data-astro-cid-36f73x6d> ${nombre || "Actor sin nombre"} </h2> <!-- Birth Info - Versión mejorada --> <div class="mt-auto mb-2 text-xs space-y-2" data-astro-cid-36f73x6d> <div class="info-pill bg-opacity-20 bg-blue-500 backdrop-filter backdrop-blur-sm rounded px-2 py-1.5" data-astro-cid-36f73x6d> <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 mr-1.5 text-pastel-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-36f73x6d> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" data-astro-cid-36f73x6d></path> </svg> <span class="font-semibold text-pastel-yellow" data-astro-cid-36f73x6d>Nacimiento:</span> <span class="ml-1" data-astro-cid-36f73x6d>${fechaNacimiento ? formatDate(fechaNacimiento) : "No disponible"}</span> ${age && renderTemplate`<span class="ml-1 text-pastel-yellow" data-astro-cid-36f73x6d>(${age} años)</span>`} </div> <div class="info-pill bg-opacity-20 bg-blue-500 backdrop-filter backdrop-blur-sm rounded px-2 py-1.5" data-astro-cid-36f73x6d> <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 mr-1.5 text-pastel-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-36f73x6d> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" data-astro-cid-36f73x6d></path> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" data-astro-cid-36f73x6d></path> </svg> <span class="font-semibold text-pastel-yellow" data-astro-cid-36f73x6d>Origen:</span> <span class="ml-1" data-astro-cid-36f73x6d>${lugarNacimiento || "No disponible"}</span> </div> </div> <!-- View Details Button --> <div class="mt-auto pt-3" data-astro-cid-36f73x6d> <span class="view-details-btn" data-astro-cid-36f73x6d>
Ver detalles
<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-36f73x6d> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" data-astro-cid-36f73x6d></path> </svg> </span> </div> </div> </a> </div> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/CardActor.astro", void 0);

const $$Astro$1 = createAstro();
const $$CategoriasButton = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CategoriasButton;
  const { href } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<a${addAttribute(href, "href")} class="flex-row justify-center text-white cursor-pointer hover:bg-coral-yellow focus:ring-4 focus:outline-none focus:ring-[#1dalf2]/50 font-bold text-sm rounded-lg px-4 py-3 text-center inline-flex items-center dark:focus:ring-[#1dalf2]/55 ml-1 mr-2 mb-2 mt-2 hover:shadow-lg transition-all duration-200 ease-in-out hover:scale-110 scale-90 gap-x-2 opacity-95 hover:opacity-100"> ${renderSlot($$result, $$slots["before"])} ${renderSlot($$result, $$slots["default"])} ${renderSlot($$result, $$slots["after"])} </a> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/CategoriasButton.astro", void 0);

const $$Astro = createAstro();
const $$Busqueda$1 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Busqueda$1;
  const queryParams = new URLSearchParams(Astro2.request.url.split("?")[1]);
  const title = queryParams.get("query") || "";
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
  async function loadAllPages(getDataFunction, searchTerm, paramName = "title") {
    let page = 1;
    let allItems = [];
    let hasMore = true;
    const maxPages = 5;
    while (hasMore && page <= maxPages) {
      try {
        const params = { page: page.toString() };
        params[paramName] = searchTerm;
        const result = await getDataFunction(params);
        if (result.length > 0) {
          allItems = allItems.concat(result);
          page++;
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Error al cargar la p\xE1gina ${page}:`, error);
        hasMore = false;
      }
    }
    return allItems;
  }
  const allMovies = await loadAllPages(getMoviesByTitle, title, "title");
  const allSeries = await loadAllPages(getSeriesByTitle, title, "title");
  const allActors = await loadAllPages(getActorsByName, title, "name");
  const limitedMovies = allMovies.slice(0, 65);
  const limitedSeries = allSeries.slice(0, 65);
  const limitedActors = allActors.slice(0, 30);
  const totalResults = limitedMovies.length + limitedSeries.length + limitedActors.length;
  return renderTemplate`${maybeRenderHead()}<div class="search-results-container max-w-7xl mx-auto px-4 py-6"> <!-- Cabecera de resultados con término de búsqueda --> <div class="mb-8 text-center "> <h1 class="text-coral-red font-bold text-3xl sm:text-4xl md:text-5xl mb-2 animate-fade-in">
Resultados para: <span class="text-navy-blue">${title}</span> </h1> <p class="text-gray-700 text-lg"> ${totalResults > 0 ? `Encontramos ${totalResults} resultados (${limitedMovies.length} pel\xEDculas, ${limitedSeries.length} series y ${limitedActors.length} actores)` : "No se encontraron resultados para tu b\xFAsqueda"} </p> </div> <!-- Menú de navegación sticky --> <nav class="sticky top-0 z-50 bg-navy-blue rounded-lg shadow-lg mb-8 animate-slide-down"> <div class="max-w-7xl mx-auto"> <div class="flex flex-wrap justify-center items-center p-2"> ${renderComponent($$result, "CategoriasButton", $$CategoriasButton, { "href": "#top", "class": "m-2 px-6 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-300 flex items-center" }, { "default": async ($$result2) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"> <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path> </svg>
Inicio
` })} ${limitedMovies.length > 0 && renderTemplate`${renderComponent($$result, "CategoriasButton", $$CategoriasButton, { "href": "#peliculas", "class": "m-2 px-6 py-2 rounded-lg bg-coral-red text-white hover:bg-red-600 transition-colors duration-300 flex items-center" }, { "default": async ($$result2) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-6h1V5h-1v2zm-2 0h1V5h-1v2zM9 5v2h1V5H9zM5 5v2h1V5H5zm0 8v2h1v-2H5zm0-2v2h1v-2H5zm2 2v2h1v-2H7zm2 0v2h1v-2H9zm2 0v2h1v-2h-1zm2 0v2h1v-2h-1zm-8-2v2h1v-2H5zm2 0v2h1v-2H7zm2 0v2h1v-2H9z" clip-rule="evenodd"></path> </svg>
Películas (${limitedMovies.length})
` })}`} ${limitedSeries.length > 0 && renderTemplate`${renderComponent($$result, "CategoriasButton", $$CategoriasButton, { "href": "#series", "class": "m-2 px-6 py-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors duration-300 flex items-center" }, { "default": async ($$result2) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"></path> </svg>
Series (${limitedSeries.length})
` })}`} ${limitedActors.length > 0 && renderTemplate`${renderComponent($$result, "CategoriasButton", $$CategoriasButton, { "href": "#actores", "class": "m-2 px-6 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors duration-300 flex items-center" }, { "default": async ($$result2) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"> <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path> </svg>
Actores (${limitedActors.length})
` })}`} </div> </div> </nav> ${totalResults === 0 ? renderTemplate`<div class="flex flex-col items-center justify-center py-16 text-center animate-fade-in"> <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg> <h2 class="text-2xl font-bold text-coral-red mb-2">No encontramos resultados para "${title}"</h2> <p class="text-gray-600 mb-6 max-w-lg">Intenta con otro término o revisa la ortografía de tu
                    búsqueda.</p> <a href="/" class="px-6 py-3 bg-navy-blue text-white rounded-lg hover:bg-blue-800 transition-colors duration-300 flex items-center"> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"></path> </svg>
Volver al inicio
</a> </div>` : renderTemplate`<div class="space-y-12">  ${limitedMovies.length > 0 && renderTemplate`<section id="peliculas" class="scroll-mt-24 animate-fade-in"> <div class="flex items-center mb-6"> <h2 class="text-coral-red font-bold text-2xl md:text-3xl">PELÍCULAS</h2> <div class="ml-4 h-1 bg-coral-red flex-grow rounded-full opacity-50"></div> </div> <div class="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"> ${limitedMovies.map((item, index) => renderTemplate`<div class="movie-card card-wrapper transform hover:scale-105 transition-transform duration-200"${addAttribute(`--animation-delay: ${index * 0.05}s`, "style")}> ${renderComponent($$result, "CardMovie", $$CardMovie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "title": item.title, "vote_average": item.vote_average, "overview": item.overview, "release_date": item.release_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers })} </div>`)} </div> </section>`}  ${limitedSeries.length > 0 && renderTemplate`<section id="series" class="scroll-mt-24 animate-fade-in"> <div class="flex items-center mb-6"> <h2 class="text-coral-red font-bold text-2xl md:text-3xl">SERIES</h2> <div class="ml-4 h-1 bg-coral-red flex-grow rounded-full opacity-50"></div> </div> <div class="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"> ${limitedSeries.map((item, index) => renderTemplate`<div class="series-card card-wrapper transform hover:scale-105 transition-transform duration-200"${addAttribute(`--animation-delay: ${index * 0.05}s`, "style")}> ${renderComponent($$result, "CardSerie", $$CardSerie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "name": item.name, "vote_average": item.vote_average, "overview": item.overview, "first_air_date": item.first_air_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers, "last_episode_to_air": item.last_episode_to_air, "next_episode_to_air": item.next_episode_to_air })} </div>`)} </div> </section>`}  ${limitedActors.length > 0 && renderTemplate`<section id="actores" class="scroll-mt-24 animate-fade-in"> <div class="flex items-center mb-6"> <h2 class="text-coral-red font-bold text-2xl md:text-3xl">ACTORES</h2> <div class="ml-4 h-1 bg-purple-500 flex-grow rounded-full opacity-50"></div> </div> <div class="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"> ${limitedActors.map((item, index) => renderTemplate`<div class="actor-card card-wrapper transform hover:scale-105 transition-transform duration-200"${addAttribute(`--animation-delay: ${index * 0.05}s`, "style")}> ${renderComponent($$result, "CardActor", $$CardActor, { "id": item.id.toString(), "imagen": item.imagen ? `https://image.tmdb.org/t/p/w500${item.imagen}` : "/placeholder-actor.jpg", "nombre": item.nombre, "popularidad": item.popularidad, "lugarNacimiento": item.lugarNacimiento || void 0, "fechaNacimiento": item.fechaNacimiento || void 0 })} </div>`)} </div> </section>`} </div>`} </div> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/Busqueda.astro", void 0);

const $$Busqueda = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Resultados" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Busqueda", $$Busqueda$1, {})} ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/busqueda.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/busqueda.astro";
const $$url = "/busqueda";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Busqueda,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
