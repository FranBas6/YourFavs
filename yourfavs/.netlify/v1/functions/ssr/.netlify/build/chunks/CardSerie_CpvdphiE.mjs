import { e as createComponent, f as createAstro, m as maybeRenderHead, h as addAttribute, r as renderTemplate } from './astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import 'clsx';
/* empty css                            */

const $$Astro = createAstro();
const $$CardSerie = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CardSerie;
  const {
    name,
    img,
    vote_average,
    id,
    overview,
    first_air_date,
    seasons,
    last_episode_to_air,
    next_episode_to_air,
    genres,
    status
  } = Astro2.props;
  const numberOfSeasons = seasons?.filter((season) => season.season_number !== 0).length || 0;
  const isRunning = next_episode_to_air ? true : false;
  const lastAirDate = last_episode_to_air?.air_date || "";
  const getAirPeriod = () => {
    if (!first_air_date) return "";
    const releaseYear = new Date(first_air_date).getFullYear();
    if (isRunning) {
      return `${releaseYear} - Presente`;
    }
    if (lastAirDate) {
      const endYear = new Date(lastAirDate).getFullYear();
      if (endYear !== releaseYear) {
        return `${releaseYear} - ${endYear}`;
      }
    }
    if (numberOfSeasons === 1) {
      return `${releaseYear}`;
    }
    return `${releaseYear}`;
  };
  const displayGenres = genres?.slice(0, 2) || [];
  const isRecent = first_air_date ? (/* @__PURE__ */ new Date()).getTime() - new Date(first_air_date).getTime() < 90 * 24 * 60 * 60 * 1e3 : false;
  const isTrending = vote_average >= 8;
  const getRatingColor = (rating) => {
    if (rating >= 8) return "bg-emerald-500 text-white";
    if (rating >= 7) return "bg-green-500 text-white";
    if (rating >= 6) return "bg-yellow-500 text-gray-900";
    if (rating >= 5) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
  };
  return renderTemplate`${maybeRenderHead()}<div class="media-card group" data-astro-cid-uaqc4y4l> <a${addAttribute(`/serie/${id}`, "href")} class="rounded-lg overflow-hidden shadow-xl bg-midnight-blue hover:scale-105 hover:bg-dark-blue transition duration-300 flex flex-col h-full border border-transparent hover:border-coral-plat relative will-change-transform" data-astro-cid-uaqc4y4l> <!-- Trending/New Badge --> ${(isRecent || isTrending) && renderTemplate`<div class="absolute top-0 left-0 z-10 m-3" data-astro-cid-uaqc4y4l> ${isRecent && renderTemplate`<div class="badge bg-teal-500 text-white text-xs font-bold px-2 py-1 rounded-full mb-1 shadow-lg" data-astro-cid-uaqc4y4l>
NUEVO
</div>`} ${isTrending && renderTemplate`<div class="badge bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center" data-astro-cid-uaqc4y4l> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-uaqc4y4l> <path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05c-.867 1.5-1.048 3.11-.967 4.652a.75.75 0 01.551.755c-.03.75.232 1.45.732 1.952.5.502 1.202.763 1.95.732.75.032 1.45-.232 1.952-.732.5-.5.764-1.202.732-1.952a.75.75 0 01.551-.755c.08-.246.176-.486.286-.72.284-.54.64-1.06 1.07-1.518.44-.467.96-.867 1.59-1.117.63-.25 1.34-.324 2.09-.224.51.07.826-.544.63-1.01-.327-.76-.902-1.397-1.673-1.874a6.17 6.17 0 00-2.148-.902C12.878 2.55 12.63 2.535 12.395 2.553z" clip-rule="evenodd" data-astro-cid-uaqc4y4l></path> </svg>
TRENDING
</div>`} </div>`} <div class="relative overflow-hidden" data-astro-cid-uaqc4y4l> <!-- Poster Image --> <img class="w-full h-64 md:h-72 object-cover rounded-t-lg transition-transform duration-500 group-hover:scale-110"${addAttribute(img, "src")}${addAttribute(`Poster for ${name}`, "alt")} loading="lazy" data-astro-cid-uaqc4y4l> <div${addAttribute(`rating-badge ${getRatingColor(vote_average)} flex items-center justify-center shadow-lg`, "class")} data-astro-cid-uaqc4y4l> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-uaqc4y4l> <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" data-astro-cid-uaqc4y4l></path> </svg> <span class="font-semibold" data-astro-cid-uaqc4y4l>${vote_average ? vote_average.toFixed(1) : "N/A"}</span> </div> <!-- Gradient Overlay --> <div class="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-dark-blue via-dark-blue/80 to-transparent" data-astro-cid-uaqc4y4l></div> </div> <div class="p-4 sm:p-5 flex-grow flex flex-col" data-astro-cid-uaqc4y4l> <!-- Title --> <h2 class="text-lg sm:text-xl font-bold tracking-tight text-coral-plat leading-tight mb-2 line-clamp-2" data-astro-cid-uaqc4y4l> ${name} </h2>  <div class="flex flex-wrap items-center gap-3 mb-3" data-astro-cid-uaqc4y4l>  <div class="info-pill text-coral-white" data-astro-cid-uaqc4y4l> <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-uaqc4y4l> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" data-astro-cid-uaqc4y4l></path> </svg> <span class="text-xs" data-astro-cid-uaqc4y4l>${getAirPeriod()}</span> </div>  ${numberOfSeasons > 0 && renderTemplate`<div class="info-pill text-coral-white" data-astro-cid-uaqc4y4l> <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-uaqc4y4l> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" data-astro-cid-uaqc4y4l></path> </svg> <span class="text-xs" data-astro-cid-uaqc4y4l> ${numberOfSeasons} ${numberOfSeasons === 1 ? "Temporada" : "Temporadas"} </span> </div>`} </div> <!-- Genres --> ${displayGenres.length > 0 && renderTemplate`<div class="flex flex-wrap gap-2 mb-3" data-astro-cid-uaqc4y4l> ${displayGenres.map((genre) => renderTemplate`<span class="genre-tag" data-astro-cid-uaqc4y4l> ${genre.name} </span>`)} </div>`} <!-- Overview --> <p class="font-light text-coral-white text-xs sm:text-sm mb-4 flex-grow line-clamp-3" data-astro-cid-uaqc4y4l> ${overview || "Sin descripci\xF3n disponible."} </p> <!-- View Details Button --> <div class="mt-auto pt-3" data-astro-cid-uaqc4y4l> <span class="view-details-btn" data-astro-cid-uaqc4y4l>
Ver detalles
<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-uaqc4y4l> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" data-astro-cid-uaqc4y4l></path> </svg> </span> </div> </div> </a> </div> `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/components/CardSerie.astro", void 0);

export { $$CardSerie as $ };
