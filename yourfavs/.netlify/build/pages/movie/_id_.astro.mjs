/* empty css                                    */
import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute, n as Fragment } from '../../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../../chunks/Layout_BE7GQMPS.mjs';
import { c as getMovieById, d as getMovieCast, e as getMovieDirectorsAndRoles, f as getMovieTrailer, h as fetchAllMoviePosters, i as getMovieCollectionInfo } from '../../chunks/yourfavsMovie_CLbWrIZn.mjs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
/* empty css                                   */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$id = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$id;
  const firebaseConfig = {
    apiKey: "AIzaSyBgSBLbdNMNnAwX94CJhccGWHzunl6519E",
    authDomain: "yourfavsbd.firebaseapp.com",
    projectId: "yourfavsbd",
    storageBucket: "yourfavsbd.firebasestorage.app",
    messagingSenderId: "68077586193",
    appId: "1:68077586193:web:411867f86654e4a758aeb0",
    measurementId: "G-BLZX9401GZ"
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const { id } = Astro2.params;
  if (!id) {
    throw new Error("ID de la pel\xEDcula no encontrado en la URL");
  }
  if (Astro2.request.method === "POST") {
    const formData = await Astro2.request.formData();
    const movieId = String(formData.get("id"));
    const action = String(formData.get("action"));
    const listType = String(formData.get("list_type"));
    let genres = [];
    try {
      genres = JSON.parse(String(formData.get("genres")) || "[]");
    } catch (error) {
      console.error("Error al parsear los g\xE9neros:", error);
    }
    const movieData = {
      id: movieId,
      poster_path: String(formData.get("poster_path") || ""),
      title: String(formData.get("title") || "Sin nombre"),
      vote_average: Number(formData.get("vote_average") || 0),
      overview: String(formData.get("overview") || "Sin descripci\xF3n"),
      added_at: /* @__PURE__ */ new Date(),
      // Guardar la fecha y hora actual
      genres,
      // Guardar los géneros como array
      release_date: String(formData.get("release_date") || "")
    };
    let collectionName;
    if (listType === "favorites") {
      collectionName = "MovieFavs";
    } else if (listType === "pendientes") {
      collectionName = "MoviesPendientes";
    } else if (listType === "vistas") {
      collectionName = "MoviesVistas";
    }
    if (collectionName) {
      const docRef = doc(db, collectionName, movieId);
      const docSnap = await getDoc(docRef);
      const exists = docSnap.exists();
      if (action === "add" && !exists) {
        await setDoc(docRef, movieData);
      } else if (action === "remove" && exists) {
        await deleteDoc(docRef);
      }
    }
    return Astro2.redirect(`/movie/${id}`);
  }
  let item = null;
  let cast = [];
  let directors = [];
  let trailerUrl = null;
  let title = "Pel\xEDcula no encontrada";
  if (id) {
    item = await getMovieById({ id });
    cast = await getMovieCast(id);
    directors = await getMovieDirectorsAndRoles(id);
    trailerUrl = await getMovieTrailer(id);
    title = item?.title || title;
  }
  const clientData = {
    id: String(item?.id),
    poster_path: item?.poster_path || "",
    title: item?.title || "Sin nombre",
    vote_average: item?.vote_average ? Number(item.vote_average) : 0,
    overview: item?.overview || "Sin descripci\xF3n",
    genres: item?.genres || [],
    // Asegurar que siempre sea un array
    release_date: item?.release_date || ""
  };
  const docRefFavs = doc(db, "MovieFavs", clientData.id);
  const docRefPendientes = doc(db, "MoviesPendientes", clientData.id);
  const docRefVistas = doc(db, "MoviesVistas", clientData.id);
  const [docSnapFavs, docSnapPendientes, docSnapVistas] = await Promise.all([
    getDoc(docRefFavs),
    getDoc(docRefPendientes),
    getDoc(docRefVistas)
  ]);
  const existingFavs = docSnapFavs.exists();
  const existingPendientes = docSnapPendientes.exists();
  const existingVistas = docSnapVistas.exists();
  const isInFavorites = existingFavs;
  const isInPendientes = existingPendientes;
  const isInVistas = existingVistas;
  const formatDate = (dateString) => {
    if (!dateString) return "No disponible";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  };
  const languageMap = {
    en: "Ingl\xE9s",
    es: "Espa\xF1ol",
    fr: "Franc\xE9s",
    de: "Alem\xE1n",
    it: "Italiano",
    pt: "Portugu\xE9s",
    ru: "Ruso",
    ja: "Japon\xE9s",
    ko: "Coreano",
    zh: "Chino",
    ar: "\xC1rabe",
    hi: "Hindi"
    // Añade más mapeos según necesites
  };
  const providerLinks = {
    "Netflix": "https://www.netflix.com/",
    "Disney Plus": "https://www.disneyplus.com/",
    "Max": "https://www.max.com/",
    "Amazon Prime Video": "https://www.primevideo.com/",
    "Apple TV+": "https://tv.apple.com/",
    "Filmin": "https://www.filmin.es/",
    "Movistar Plus+": "https://www.movistarplus.es/",
    "Rakuten TV": "https://rakuten.tv/",
    "SkyShowtime": "https://www.skyshowtime.com/",
    "MUBI": "https://mubi.com/",
    "FlixOl\xE9": "https://flixole.com/",
    "Atresplayer": "https://www.atresplayer.com/",
    "RTVE Play": "https://www.rtve.es/play/",
    "Google Play Movies": "https://play.google.com/store/movies",
    "YouTube": "https://www.youtube.com/",
    "Microsoft Store": "https://www.microsoft.com/store/movies",
    "Plex": "https://www.plex.tv/",
    "fuboTV": "https://www.fubo.tv/",
    "Hayu": "https://www.hayu.com/",
    "Curiosity Stream": "https://curiositystream.com/",
    "GuideDoc": "https://guidedoc.tv/",
    "MagellanTV": "https://www.magellantv.com/",
    "DOCSVILLE": "https://www.docsville.com/",
    "WOW Presents Plus": "https://www.wowpresentsplus.com/",
    "Mitele": "https://www.mitele.es/"
    // Agrega más proveedores según sea necesario
  };
  const providerElements = item?.providers?.map((provider) => {
    const link = providerLinks[provider.provider_name];
    const hasLogo = !!provider.logo_path;
    return {
      name: provider.provider_name,
      logo: hasLogo ? `https://image.tmdb.org/t/p/w200${provider.logo_path}` : null,
      link
    };
  }) || [];
  const getRatingStars = (rating) => {
    if (!rating) return "";
    const fullStars = Math.floor(rating / 2);
    const halfStar = rating % 2 >= 1 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    return "\u2605".repeat(fullStars) + (halfStar ? "\xBD" : "") + "\u2606".repeat(emptyStars);
  };
  function formatTrailerUrl(url) {
    if (url.includes("youtube.com/embed/")) {
      return url;
    }
    let videoId = "";
    if (url.includes("youtube.com/watch")) {
      const urlObj = new URL(url);
      videoId = urlObj.searchParams.get("v");
    } else if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1].split("?")[0];
    }
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
  }
  let posters = [];
  if (id) {
    try {
      const allPosters = await fetchAllMoviePosters(id);
      posters = allPosters.slice(0, 40);
    } catch (error) {
      console.error("Error al obtener p\xF3sters:", error);
    }
  }
  let collectionInfo;
  if (item?.belongs_to_collection) {
    try {
      collectionInfo = await getMovieCollectionInfo(item.belongs_to_collection.id);
    } catch (error) {
      console.error("Error al obtener informaci\xF3n de la colecci\xF3n:", error);
    }
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": `${title}`, "data-astro-cid-klpkwygt": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<article class="bg-gray-50" data-astro-cid-klpkwygt> <!-- Hero Section con backdrop --> <div class="relative w-full h-96 bg-cover bg-center bg-no-repeat"${addAttribute(`background-image: linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(https://image.tmdb.org/t/p/original${item?.backdrop_path})`, "style")} data-astro-cid-klpkwygt> <div class="absolute inset-0 flex items-center justify-center flex-col px-4 text-center" data-astro-cid-klpkwygt> <h1 class="text-4xl md:text-5xl font-bold text-white mb-4" data-astro-cid-klpkwygt> ${item?.title} </h1> <div class="flex items-center gap-4 text-white mb-4" data-astro-cid-klpkwygt> <span class="text-yellow-400 text-xl font-bold" data-astro-cid-klpkwygt> ${item?.vote_average?.toFixed(1)} ${getRatingStars(item?.vote_average)} </span> <span data-astro-cid-klpkwygt>${formatDate(item?.release_date)}</span> </div> ${item?.genres && renderTemplate`<div class="flex flex-wrap justify-center gap-2 mb-6" data-astro-cid-klpkwygt> ${item.genres.map((genre) => renderTemplate`<span class="bg-gray-800 bg-opacity-80 px-3 py-1 rounded-full text-xs text-white" data-astro-cid-klpkwygt> ${genre.name} </span>`)} </div>`} </div> </div> <div class="max-w-6xl mx-auto px-4 py-8" data-astro-cid-klpkwygt> <div class="flex flex-col md:flex-row gap-8" data-astro-cid-klpkwygt> <!-- Columna Izquierda: Poster y Acciones --> <div class="md:w-1/3 flex flex-col items-center" data-astro-cid-klpkwygt> <div class="w-64 h-auto rounded-lg overflow-hidden shadow-xl mb-6" data-astro-cid-klpkwygt> <img class="w-full h-auto transform hover:scale-105 transition-all duration-300"${addAttribute(`https://image.tmdb.org/t/p/w500${item?.poster_path}`, "src")}${addAttribute(item?.title, "alt")} data-astro-cid-klpkwygt> </div> <div class="flex flex-col gap-4 w-full" data-astro-cid-klpkwygt> <!-- Formulario para Personal --> <form method="POST" class="w-full" data-astro-cid-klpkwygt> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="title"${addAttribute(item?.title || "Sin nombre", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-klpkwygt> <input type="hidden" name="release_date"${addAttribute(item?.release_date || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="action"${addAttribute(isInFavorites ? "remove" : "add", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="list_type" value="favorites" data-astro-cid-klpkwygt> ${isInFavorites ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-red-600 text-white text-lg rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Eliminar de favoritos
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-blue-600 text-white text-lg rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Añadir a favoritos
</button>`} </form> <!-- Formulario para Películas Pendientes --> <form method="POST" class="w-full" data-astro-cid-klpkwygt> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="title"${addAttribute(item?.title || "Sin nombre", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-klpkwygt> <input type="hidden" name="release_date"${addAttribute(item?.release_date || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="action"${addAttribute(isInPendientes ? "remove" : "add", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="list_type" value="pendientes" data-astro-cid-klpkwygt> ${isInPendientes ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-orange-600 text-white text-lg rounded-lg shadow-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Eliminar de pendientes
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-yellow-500 text-white text-lg rounded-lg shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Añadir a pendientes
</button>`} </form> <!-- Formulario para Películas Vistas --> <form method="POST" class="w-full" data-astro-cid-klpkwygt> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="title"${addAttribute(item?.title || "Sin nombre", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-klpkwygt> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-klpkwygt> <input type="hidden" name="release_date"${addAttribute(item?.release_date || "", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="action"${addAttribute(isInVistas ? "remove" : "add", "value")} data-astro-cid-klpkwygt> <input type="hidden" name="list_type" value="vistas" data-astro-cid-klpkwygt> ${isInVistas ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-red-600 text-white text-lg rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-4.707-5.293a1 1 0 001.414 0L10 9.414l3.293 3.293a1 1 0 001.414-1.414l-4-4a1 1 0 00-1.414 0l-4 4a1 1 0 000 1.414z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Eliminar de vistas
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-green-600 text-white text-lg rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-klpkwygt> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" data-astro-cid-klpkwygt></path> </svg>
Marcar como vista
</button>`} </form> ${(item?.homepage || trailerUrl) && renderTemplate`<a${addAttribute(item?.homepage || trailerUrl, "href")} class="w-full px-6 py-3 bg-pink-600 text-white text-lg rounded-lg shadow-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all duration-300 flex items-center justify-center gap-2" target="_blank" rel="noopener" data-astro-cid-klpkwygt> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-klpkwygt> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" data-astro-cid-klpkwygt></path> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" data-astro-cid-klpkwygt></path> </svg>
Ver ahora
</a>`} </div> <!-- Info Cards --> <div class="mt-8 w-full space-y-4" data-astro-cid-klpkwygt> <div class="bg-white p-4 rounded-lg shadow-md" data-astro-cid-klpkwygt> <h3 class="text-lg font-bold text-blue-600 mb-2" data-astro-cid-klpkwygt>Información</h3> <ul class="space-y-2" data-astro-cid-klpkwygt> <li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Estreno:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${formatDate(item?.release_date)}</span> </li> <li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Valoración:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${item?.vote_average?.toFixed(1)}
(${item?.vote_count} votos)</span> </li> <li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Adulto:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${item?.adult ? "S\xED" : "No"}</span> </li> <li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Popularidad:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${item?.popularity?.toFixed(1)}</span> </li> <li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Idioma original:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${languageMap[item?.original_language] || item?.original_language}</span> </li> ${item?.original_title && item?.original_title !== item?.title && renderTemplate`<li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Título original:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt>${item?.original_title}</span> </li>`} ${item?.runtime && renderTemplate`<li class="flex justify-between" data-astro-cid-klpkwygt> <span class="text-gray-600" data-astro-cid-klpkwygt>Duración:</span> <span class="font-medium text-gray-600" data-astro-cid-klpkwygt> ${Math.floor(item.runtime / 60)} h ${item.runtime % 60} min
</span> </li>`} </ul> </div> </div> </div> <!-- Columna Derecha: Detalles --> <div class="md:w-2/3" data-astro-cid-klpkwygt> <!-- Sinopsis --> <div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Sinopsis</h2> <p class="text-gray-700 leading-relaxed" data-astro-cid-klpkwygt>${item?.overview || "No hay sinopsis disponible."}</p> </div> <!-- Trailer --> ${trailerUrl && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Trailer</h2> <div class="aspect-video w-full" data-astro-cid-klpkwygt> <iframe class="w-full h-full rounded"${addAttribute(formatTrailerUrl(trailerUrl), "src")} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-astro-cid-klpkwygt></iframe> </div> </div>`} <!-- Colección --> ${item?.belongs_to_collection && collectionInfo && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Saga / Colección</h2> <div class="mb-4" data-astro-cid-klpkwygt> <h3 class="text-xl font-semibold text-gray-800 mb-2" data-astro-cid-klpkwygt>${collectionInfo.name}</h3> ${collectionInfo.overview && renderTemplate`<p class="text-gray-700 mb-4" data-astro-cid-klpkwygt>${collectionInfo.overview}</p>`} </div> ${collectionInfo.parts && collectionInfo.parts.length > 0 && renderTemplate`<div class="mt-4" data-astro-cid-klpkwygt> <h4 class="text-lg font-medium text-gray-700 mb-3" data-astro-cid-klpkwygt>Películas en esta
                                                colección:</h4> <div class="carousel-container relative max-w-full overflow-hidden" data-astro-cid-klpkwygt> <div class="carousel-track flex gap-4 overflow-x-auto pb-4 scrollbar-hide" data-astro-cid-klpkwygt> ${collectionInfo.parts.sort((a, b) => {
    const dateA = new Date(a.release_date || "9999-12-31").getTime();
    const dateB = new Date(b.release_date || "9999-12-31").getTime();
    return dateA - dateB;
  }).map((movie) => renderTemplate`<div class="carousel-slide flex-shrink-0 w-36" data-astro-cid-klpkwygt> <a${addAttribute(`/movie/${movie.id}`, "href")} class="block" data-astro-cid-klpkwygt> <div class="relative group" data-astro-cid-klpkwygt> <!-- Contenedor para la imagen con padding condicional --> <div${addAttribute(`relative rounded-lg overflow-hidden ${movie.id === item.id ? "p-1 bg-blue-500" : ""}`, "class")} data-astro-cid-klpkwygt> <img${addAttribute(movie.poster_path || "/img/no-poster.png", "src")}${addAttribute(movie.title, "alt")} loading="lazy" class="w-full h-48 object-cover rounded-lg shadow-md hover:brightness-90 transition-all duration-200" data-astro-cid-klpkwygt> <!-- Overlay para películas que no son la actual --> ${movie.id !== item.id && renderTemplate`<div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg" data-astro-cid-klpkwygt></div>`} </div> <!-- Etiqueta "Actual" mejorada --> ${movie.id === item.id && renderTemplate`<div class="absolute bottom-0 left-0 right-0 bg-blue-600 text-white text-xs py-1 font-medium text-center" data-astro-cid-klpkwygt>
Actual
</div>`} </div> <p class="text-gray-600 text-sm font-medium text-center mt-2 line-clamp-2" data-astro-cid-klpkwygt> ${movie.title} </p> <p class="text-xs text-gray-600 text-center mt-1" data-astro-cid-klpkwygt> ${movie.release_date ? new Date(movie.release_date).getFullYear() : "Pr\xF3ximamente"} </p> </a> </div>`)} </div> </div> </div>`} </div>`} <!-- Pósters --> <div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Pósters</h2> ${posters && posters.length > 0 ? renderTemplate`<div class="carousel-container relative max-w-full overflow-hidden" data-astro-cid-klpkwygt> <div class="carousel-track flex gap-4 overflow-x-auto pb-4 scrollbar-hide" data-astro-cid-klpkwygt> ${posters.slice(0, 40).map((poster, index) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-klpkwygt": true }, { "default": async ($$result3) => renderTemplate` <div class="carousel-slide flex-shrink-0 w-48" data-astro-cid-klpkwygt> <a${addAttribute(`#poster-${index}`, "href")} data-astro-cid-klpkwygt> <img${addAttribute(poster.file_path, "src")}${addAttribute(`P\xF3ster ${poster.vote_average.toFixed(1)}/10`, "alt")} loading="lazy" class="rounded-lg shadow-md w-full h-64 object-cover" data-astro-cid-klpkwygt> </a> </div> <div${addAttribute(`poster-${index}`, "id")} class="modal" data-astro-cid-klpkwygt> <a href="#" class="modal-close" data-astro-cid-klpkwygt>&times;</a> <img${addAttribute(poster.file_path, "src")}${addAttribute(`P\xF3ster ${poster.vote_average.toFixed(1)}/10`, "alt")} data-astro-cid-klpkwygt> </div> ` })}`)} </div> </div>` : renderTemplate`<p class="text-gray-600 text-center" data-astro-cid-klpkwygt>No se encontraron pósters para esta serie</p>`} </div> <!-- Reparto y Equipo --> <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" data-astro-cid-klpkwygt>  <div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Reparto</h2> <div class="text-gray-600" data-astro-cid-klpkwygt> ${cast?.length > 0 ? renderTemplate`<ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-astro-cid-klpkwygt> ${cast.map((actor) => renderTemplate`<li class="border-b border-gray-100 py-1 last:border-0" data-astro-cid-klpkwygt> <a${addAttribute(`/actor/${actor}`, "href")} class="text-gray-600 hover:text-blue-600 hover:underline transition duration-300" data-astro-cid-klpkwygt> ${actor} </a> </li>`)} </ul>` : renderTemplate`<p class="text-gray-500" data-astro-cid-klpkwygt>Información no disponible</p>`} </div> </div> <!-- Equipo --> <div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Equipo</h2> <div class="text-gray-600" data-astro-cid-klpkwygt> ${directors?.length > 0 ? renderTemplate`<ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-astro-cid-klpkwygt> ${directors.map((director) => renderTemplate`<li class="border-b border-gray-100 py-1 last:border-0" data-astro-cid-klpkwygt> <span class="font-medium" data-astro-cid-klpkwygt>${director.job}: </span> <span data-astro-cid-klpkwygt>${director.name}</span> </li>`)} </ul>` : renderTemplate`<p class="text-gray-500" data-astro-cid-klpkwygt>Información no disponible</p>`} </div> </div> </div> <!-- Plataformas y Productoras en dos columnas --> <div class="grid grid-cols-1 md:grid-cols-2 gap-6" data-astro-cid-klpkwygt> <!-- Plataformas --> ${providerElements.length > 0 && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Disponible en</h2> <div class="grid grid-cols-3 sm:grid-cols-3 gap-4" data-astro-cid-klpkwygt> ${providerElements.map((provider) => renderTemplate`<div class="flex flex-col items-center" data-astro-cid-klpkwygt> ${provider.logo ? provider.link ? renderTemplate`<a${addAttribute(provider.link, "href")} target="_blank" rel="noopener noreferrer" data-astro-cid-klpkwygt> <img${addAttribute(provider.logo, "src")}${addAttribute(provider.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-klpkwygt> </a>` : renderTemplate`<img${addAttribute(provider.logo, "src")}${addAttribute(provider.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-klpkwygt>` : renderTemplate`<div class="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center mb-2" data-astro-cid-klpkwygt> <span class="text-xs text-gray-500" data-astro-cid-klpkwygt>Sin logo</span> </div>`} <p class="text-xs text-center text-gray-600" data-astro-cid-klpkwygt>${provider.name}</p> </div>`)} </div> </div>`} <!-- Productoras --> ${item?.production_companies && item.production_companies.length > 0 && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-klpkwygt> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-klpkwygt>Productoras</h2> <div class="grid grid-cols-3 sm:grid-cols-3 gap-4" data-astro-cid-klpkwygt> ${item.production_companies.map((company) => renderTemplate`<div class="flex flex-col items-center" data-astro-cid-klpkwygt> ${company?.logo_path ? renderTemplate`<img${addAttribute(`https://image.tmdb.org/t/p/w200${company.logo_path}`, "src")}${addAttribute(company.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-klpkwygt>` : renderTemplate`<div class="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center mb-2" data-astro-cid-klpkwygt> <span class="text-xs text-gray-500" data-astro-cid-klpkwygt>Sin logo</span> </div>`} <p class="text-xs text-center text-gray-500" data-astro-cid-klpkwygt>${company.name}</p> </div>`)} </div> </div>`} </div> </div> </div> </div> </article> ` })} `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/movie/[id].astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/movie/[id].astro";
const $$url = "/movie/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$id,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
