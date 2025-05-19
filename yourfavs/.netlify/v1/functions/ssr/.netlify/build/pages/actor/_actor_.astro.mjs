/* empty css                                    */
import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from '../../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../../chunks/Layout_BE7GQMPS.mjs';
import { g as getSeriesByActorName, a as getMoviesByActorName, b as getActorDetails } from '../../chunks/yourfavsActor_CjtWvdYy.mjs';
import { $ as $$CardMovie } from '../../chunks/CardMovie_DG0ROOzd.mjs';
import { $ as $$CardSerie } from '../../chunks/CardSerie_CpvdphiE.mjs';
/* empty css                                      */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$actor = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$actor;
  const { actor } = Astro2.params;
  if (!actor) {
    throw new Error("ID de la pel\xEDcula no encontrado en la URL");
  }
  const series = await getSeriesByActorName({ name: actor });
  const movies = await getMoviesByActorName({ name: actor });
  const actorDetails = await getActorDetails({ name: actor });
  const actorInfo = actorDetails || {
    nombre: actor,
    biografia: "Informaci\xF3n biogr\xE1fica del actor no disponible.",
    lugarNacimiento: null,
    fechaNacimiento: null,
    imagen: "/placeholder-actor.jpg",
    // Asegúrate de tener una imagen predeterminada
    popularidad: null,
    conocidoPor: "Actuaci\xF3n"
  };
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
  const totalMovies = movies.length;
  const totalSeries = series.length;
  const totalProductions = totalMovies + totalSeries;
  const movieGenres = movies.flatMap((m) => m.genre_ids || []).reduce((acc, genreId) => {
    acc[genreId] = (acc[genreId] || 0) + 1;
    return acc;
  }, {});
  const topGenres = Object.entries(movieGenres).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([genreId, count]) => genresMap[genreId]);
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": `${actor}` }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="actor-profile-bg"></div> <section class="container mx-auto px-4 py-8 relative"> <!-- Perfil del Actor --> <div class="actor-profile mb-16"> <div class="flex flex-col md:flex-row items-center md:items-start gap-8"> <div class="profile-image-container"> ${actorInfo.imagen ? renderTemplate`<img${addAttribute(`https://image.tmdb.org/t/p/w500${actorInfo.imagen}`, "src")}${addAttribute(`Foto de ${actorInfo.nombre}`, "alt")} class="profile-image">` : renderTemplate`<div class="profile-image-placeholder"> <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24" viewBox="0 0 20 20" fill="currentColor"> <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path> </svg> </div>`} ${actorInfo.popularidad && renderTemplate`<div class="popularity-badge"> <div class="popularity-inner"> <span class="popularity-value">${actorInfo.popularidad.toFixed(1)}</span> <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"> <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path> </svg> </div> </div>`} </div> <div class="flex-1"> <h1 class="text-coral-red font-extrabold text-4xl md:text-5xl lg:text-6xl mb-4"> ${actorInfo.nombre} </h1> <div class="w-24 h-1 bg-coral-red rounded-full mb-6"></div> <div class="actor-stats flex flex-wrap gap-4 mb-4"> <div class="stat-box"> <span class="stat-value">${totalProductions}</span> <span class="stat-label">Producciones</span> </div> <div class="stat-box"> <span class="stat-value">${totalMovies}</span> <span class="stat-label">Películas</span> </div> <div class="stat-box"> <span class="stat-value">${totalSeries}</span> <span class="stat-label">Series</span> </div> </div> </div> </div> <div class="mt-8"> ${actorInfo.biografia && renderTemplate`<div class="actor-bio mb-6"> <h3 class="text-lg font-semibold mb-2">Biografía</h3> <input type="checkbox" id="read-more-toggle" class="bio-toggle hidden"> <p class="text-gray-600 dark:text-gray-300 bio-text"> ${actorInfo.biografia || "Informaci\xF3n biogr\xE1fica no disponible."} </p> <label for="read-more-toggle" class="read-more-btn text-coral-red text-sm mt-2 cursor-pointer">
Leer más
</label> </div>`} <div class="actor-metadata grid grid-cols-1 md:grid-cols-2 gap-3"> ${actorInfo.fechaNacimiento && renderTemplate`<div class="metadata-item"> <span class="metadata-label">Fecha de nacimiento:</span> <span class="metadata-value">${actorInfo.fechaNacimiento}</span> </div>`} ${actorInfo.lugarNacimiento && renderTemplate`<div class="metadata-item"> <span class="metadata-label">Lugar de nacimiento:</span> <span class="metadata-value">${actorInfo.lugarNacimiento}</span> </div>`} ${actorInfo.conocidoPor && renderTemplate`<div class="metadata-item"> <span class="metadata-label">Conocido por:</span> <span class="metadata-value">${actorInfo.conocidoPor}</span> </div>`} ${topGenres.length > 0 && renderTemplate`<div class="metadata-item col-span-1 md:col-span-2"> <span class="metadata-label">Géneros más frecuentes:</span> <div class="flex flex-wrap gap-2 mt-1"> ${topGenres.map((genre) => renderTemplate`<span class="genre-badge">${genre}</span>`)} </div> </div>`} </div> </div> </div> <!-- Sección de Películas --> <section class="mb-16 content-section"> <div class="section-header-container"> <h2 class="section-header"> <span class="section-icon"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h18M3 16h18"></path> </svg> </span>
PELÍCULAS
</h2> <div class="section-header-line"></div> </div> ${movies.length === 0 ? renderTemplate`<div class="empty-state"> <p>No se encontraron películas para este actor</p> </div>` : renderTemplate`<div class="content-grid"> ${movies.map((item) => renderTemplate`<div class="card-wrapper"> ${renderComponent($$result2, "CardMovie", $$CardMovie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "title": item.title, "vote_average": item.vote_average, "overview": item.overview, "release_date": item.release_date, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "providers": item.providers })} </div>`)} </div>`} </section> <!-- Sección de Series --> <section class="mb-16 content-section"> <div class="section-header-container"> <h2 class="section-header"> <span class="section-icon"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path> </svg> </span>
SERIES
</h2> <div class="section-header-line"></div> </div> ${series.length === 0 ? renderTemplate`<div class="empty-state"> <p>No se encontraron series para este actor</p> </div>` : renderTemplate`<div class="content-grid"> ${series.map((item) => renderTemplate`<div class="card-wrapper"> ${renderComponent($$result2, "CardSerie", $$CardSerie, { "id": item.id.toString(), "img": item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "/placeholder.jpg", "name": item.name, "vote_average": item.vote_average, "overview": item.overview, "first_air_date": item.first_air_date, "seasons": item.seasons, "last_episode_to_air": item.last_episode_to_air, "next_episode_to_air": item.next_episode_to_air, "genres": item.genre_ids?.map((id) => ({ id, name: getGenreName(id) })), "status": item.status })} </div>`)} </div>`} </section> </section> ` })} `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/actor/[actor].astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/actor/[actor].astro";
const $$url = "/actor/[actor]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$actor,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
