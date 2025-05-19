/* empty css                                    */
import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute, n as Fragment } from '../../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../../chunks/Layout_BE7GQMPS.mjs';
import { k as getSeriesById, l as getSeriesCast, m as getSeriesDirectorsAndRoles, n as getSeriesTrailer, o as getSeriesStatus, p as getEpisodesBySeasonNumber, q as fetchAllSeriesPosters } from '../../chunks/yourfavsSerie_BwU6ZL0r.mjs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, query, orderBy, getDocs, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
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
    throw new Error("ID de la serie no encontrado en la URL");
  }
  if (Astro2.request.method === "POST") {
    try {
      const formData = await Astro2.request.formData();
      const serieId = String(formData.get("id") || formData.get("serie_id"));
      const action = String(formData.get("action"));
      const actionType = String(formData.get("actionType"));
      let coleccion;
      switch (actionType) {
        case "pendientes":
          coleccion = "SeriesPendiente";
          break;
        case "vistas":
          coleccion = "SeriesVistas";
          break;
        case "siguiendo":
          coleccion = "SeriesSiguiendo";
          break;
        case "liked":
          coleccion = "LikedSeries";
          break;
        case "favs":
          coleccion = "SeriesFavs";
          break;
        default:
          throw new Error(`Tipo de acci\xF3n no v\xE1lido: ${actionType}`);
      }
      const coleccionRef = collection(db, coleccion);
      const docRef = doc(db, coleccion, serieId);
      const docSnap = await getDoc(docRef);
      const serieExiste = docSnap.exists();
      const customPosition = formData.get("custom_position") ? Number(formData.get("custom_position")) : null;
      if (action === "add" && !serieExiste) {
        const genres = JSON.parse(String(formData.get("genres") || "[]"));
        const seasons = JSON.parse(String(formData.get("seasons") || "[]"));
        const lastEpisodeToAir = JSON.parse(String(formData.get("last_episode_to_air") || "null"));
        const nextEpisodeToAir = JSON.parse(String(formData.get("next_episode_to_air") || "null"));
        const newEntry = {
          id: serieId,
          name: String(formData.get("name") || "Sin nombre"),
          poster_path: String(formData.get("poster_path") || ""),
          // Cambiado de poster_path a img
          vote_average: Number(formData.get("vote_average") || 0),
          overview: String(formData.get("overview") || "Sin descripci\xF3n"),
          added_at: /* @__PURE__ */ new Date(),
          // Almacenar como objetos estructurados
          genres,
          first_air_date: String(formData.get("first_air_date") || ""),
          status: String(formData.get("status") || ""),
          seasons,
          last_episode_to_air: lastEpisodeToAir,
          next_episode_to_air: nextEpisodeToAir,
          position: 0
        };
        if (coleccion === "SeriesFavs") {
          const favsQuery = query(collection(db, "SeriesFavs"), orderBy("position"));
          const favsSnapshot = await getDocs(favsQuery);
          const currentFavorites = [];
          favsSnapshot.forEach((doc2) => {
            currentFavorites.push({ id: doc2.id, ...doc2.data() });
          });
          let newPosition;
          if (customPosition !== null) {
            const seriesToUpdate = currentFavorites.filter((fav) => fav.position >= customPosition);
            for (const fav of seriesToUpdate.sort((a, b) => b.position - a.position)) {
              await updateDoc(doc(db, "SeriesFavs", fav.id), {
                position: fav.position + 1
              });
            }
            newPosition = customPosition;
          } else {
            newPosition = currentFavorites.length > 0 ? Math.max(...currentFavorites.map((f) => f.position || 0)) + 1 : 1;
          }
          newEntry.position = newPosition;
        }
        await setDoc(docRef, newEntry);
      } else if (action === "remove" && serieExiste) {
        await deleteDoc(docRef);
        if (coleccion === "SeriesFavs") {
          const favsQuery = query(collection(db, "SeriesFavs"), orderBy("position"));
          const favsSnapshot = await getDocs(favsQuery);
          const remainingFavorites = [];
          favsSnapshot.forEach((doc2) => {
            remainingFavorites.push({ id: doc2.id, ...doc2.data() });
          });
          for (let i = 0; i < remainingFavorites.length; i++) {
            await updateDoc(doc(db, "SeriesFavs", remainingFavorites[i].id), {
              position: i + 1
            });
          }
        }
      }
      return Astro2.redirect(`/serie/${serieId}`);
    } catch (error) {
      console.error("Error en el procesamiento POST:", error);
      throw new Error(`Error al procesar la solicitud: ${error.message}`);
    }
  }
  function formatRuntime(minutes) {
    if (!minutes) return "Duraci\xF3n no disponible";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours > 0 ? `${hours} hr ${remainingMinutes} min` : `${minutes} min`;
  }
  let item = await getSeriesById({ id });
  let cast = await getSeriesCast(id);
  let directors = await getSeriesDirectorsAndRoles(id);
  let trailerUrl = await getSeriesTrailer(id);
  let status = await getSeriesStatus(id);
  let title = item?.name || "Serie no encontrada";
  const clientData = {
    id: String(item?.id || ""),
    name: item?.name || "Sin nombre",
    img: item?.poster_path || "",
    // Cambiado a img manteniendo compatibilidad con poster_path
    vote_average: item?.vote_average ? Number(item.vote_average) : 0,
    overview: item?.overview || "Sin descripci\xF3n",
    first_air_date: item?.first_air_date || "",
    status: item?.status || "",
    genres: item?.genres || [],
    seasons: item?.seasons || [],
    last_episode_to_air: item?.last_episode_to_air || null,
    next_episode_to_air: item?.next_episode_to_air || null
  };
  const allSeasonEpisodes = {};
  if (item?.seasons) {
    for (const season of item.seasons) {
      if (season.season_number !== 0) {
        const episodes = await getEpisodesBySeasonNumber(id, season.season_number);
        allSeasonEpisodes[season.season_number] = episodes || [];
      }
    }
  }
  const docRefFavs = doc(db, "SeriesFavs", clientData.id);
  const docRefPendientes = doc(db, "SeriesPendiente", clientData.id);
  const docRefVistas = doc(db, "SeriesVistas", clientData.id);
  const docRefSiguiendo = doc(db, "SeriesSiguiendo", clientData.id);
  const docRefLiked = doc(db, "LikedSeries", clientData.id);
  const [docSnapFavs, docSnapPendientes, docSnapVistas, docSnapSiguiendo, docSnapLiked] = await Promise.all([
    getDoc(docRefFavs),
    getDoc(docRefPendientes),
    getDoc(docRefVistas),
    getDoc(docRefSiguiendo),
    getDoc(docRefLiked)
  ]);
  const existingInFavs = docSnapFavs.exists();
  const existingInPendientes = docSnapPendientes.exists();
  const existingInVistas = docSnapVistas.exists();
  const existingInSiguiendo = docSnapSiguiendo.exists();
  const existingInLiked = docSnapLiked.exists();
  const isInFavorites = existingInFavs;
  const isInPendientes = existingInPendientes;
  const isInVistas = existingInVistas;
  const isInSiguiendo = existingInSiguiendo;
  const isInLiked = existingInLiked;
  const formatDate = (dateString) => {
    if (!dateString) return "No disponible";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  };
  const calculateYearsActive = () => {
    if (!item?.first_air_date) return "Desconocido";
    const startYear = new Date(item.first_air_date).getFullYear();
    let endYear = "presente";
    if (status === "Ended" || status === "Canceled") {
      endYear = item?.last_episode_to_air?.air_date ? new Date(item.last_episode_to_air.air_date).getFullYear() : "desconocido";
    }
    return `${startYear} - ${endYear}`;
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
    nl: "Neerland\xE9s",
    sv: "Sueco",
    da: "Dan\xE9s",
    fi: "Finland\xE9s",
    no: "Noruego",
    pl: "Polaco",
    cs: "Checo",
    hu: "H\xFAngaro",
    tr: "Turco",
    el: "Griego",
    ro: "Rumano",
    hr: "Croata",
    bg: "B\xFAlgaro",
    sr: "Serbio",
    uk: "Ucraniano",
    he: "Hebreo",
    th: "Tailand\xE9s",
    vi: "Vietnamita",
    id: "Indonesio",
    ms: "Malayo",
    tl: "Tagalo",
    sw: "Suajili",
    sw_KE: "Suajili (Kenia)",
    is: "Island\xE9s",
    lv: "Let\xF3n",
    lt: "Lituano",
    sk: "Eslovaco",
    sl: "Esloveno",
    et: "Estonio",
    mk: "Macedonio",
    hy: "Armenio",
    ka: "Georgiano",
    am: "Am\xE1rico",
    sq: "Alban\xE9s",
    mt: "Malt\xE9s",
    bs: "Bosnio",
    ne: "Nepal\xED",
    pa: "Punjabi",
    gu: "Gujarati",
    te: "Telugu",
    ta: "Tamil",
    ml: "Malabar",
    mr: "Marathi",
    kn: "Kannada",
    or: "Odia",
    as: "Assam\xE9s",
    bn: "Bengal\xED",
    si: "Cingal\xE9s",
    hi: "Hindi",
    ur: "Urdu"
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
  const statusMap = {
    "Returning Series": "Serie en emisi\xF3n",
    Ended: "Finalizada",
    Canceled: "Cancelada",
    Pilot: "Piloto"
  };
  const calculateTotalEpisodes = () => {
    if (!item?.seasons) return 0;
    return item.seasons.reduce((total, season) => total + (season.episode_count || 0), 0);
  };
  const totalEpisodes = calculateTotalEpisodes();
  const yearsActive = calculateYearsActive();
  const getRatingStars = (rating) => {
    if (!rating) return "";
    const fullStars = Math.floor(rating / 2);
    const halfStar = rating % 2 >= 1 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    return "\u2605".repeat(fullStars) + (halfStar ? "\xBD" : "") + "\u2606".repeat(emptyStars);
  };
  const sortedSeasons = item?.seasons?.sort((a, b) => a.season_number - b.season_number) || [];
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
      const allPosters = await fetchAllSeriesPosters(id);
      posters = allPosters.slice(0, 40);
    } catch (error) {
      console.error("Error al obtener p\xF3sters:", error);
    }
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": `${title}`, "data-astro-cid-bebynwvh": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<article class="bg-gray-50" data-astro-cid-bebynwvh> <!-- Hero Section con backdrop --> <div class="relative w-full h-96 bg-cover bg-center bg-no-repeat"${addAttribute(`background-image: linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(https://image.tmdb.org/t/p/original${item?.backdrop_path})`, "style")} data-astro-cid-bebynwvh> <div class="absolute inset-0 flex items-center justify-center flex-col px-4 text-center" data-astro-cid-bebynwvh> <h1 class="text-4xl md:text-5xl font-bold text-white mb-4" data-astro-cid-bebynwvh> ${item?.name} </h1> ${isInFavorites && existingInFavs && renderTemplate`<div class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium mt-2" data-astro-cid-bebynwvh>
Favorito #${docSnapFavs.data().position} </div>`} <div class="flex items-center gap-4 text-white mb-4" data-astro-cid-bebynwvh> <span class="bg-blue-600 px-3 py-1 rounded-full text-sm font-medium" data-astro-cid-bebynwvh> ${statusMap[status] || status} </span> <span class="text-yellow-400 text-xl font-bold" data-astro-cid-bebynwvh> ${item?.vote_average?.toFixed(1)} ${getRatingStars(item?.vote_average)} </span> <span data-astro-cid-bebynwvh>${yearsActive}</span> </div> ${item?.genres && renderTemplate`<div class="flex flex-wrap justify-center gap-2 mb-6" data-astro-cid-bebynwvh> ${item.genres.map((genre) => renderTemplate`<span class="bg-gray-800 bg-opacity-80 px-3 py-1 rounded-full text-xs text-white" data-astro-cid-bebynwvh> ${genre.name} </span>`)} </div>`} <!-- Botón de Me gusta - Colocar después de la sección de géneros --> <form method="POST" class="mt-4" data-astro-cid-bebynwvh> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="name"${addAttribute(item?.name || "Sin nombre", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="first_air_date"${addAttribute(item?.first_air_date || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="status"${addAttribute(item?.status || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="action"${addAttribute(isInLiked ? "remove" : "add", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="actionType" value="liked" data-astro-cid-bebynwvh> <input type="hidden" name="seasons"${addAttribute(JSON.stringify(item?.seasons || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="last_episode_to_air"${addAttribute(JSON.stringify(item?.last_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="next_episode_to_air"${addAttribute(JSON.stringify(item?.next_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <button type="submit" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition-all flex items-center gap-2 mx-auto" aria-live="polite" data-astro-cid-bebynwvh> ${isInLiked ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-bebynwvh": true }, { "default": async ($$result3) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Ya me gusta
` })}` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-bebynwvh": true }, { "default": async ($$result3) => renderTemplate` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Me gusta
` })}`} </button> </form> </div> </div> <div class="max-w-6xl mx-auto px-4 py-8" data-astro-cid-bebynwvh> <div class="flex flex-col md:flex-row gap-8" data-astro-cid-bebynwvh> <!-- Columna Izquierda: Poster y Acciones --> <div class="md:w-1/3 flex flex-col items-center" data-astro-cid-bebynwvh> <div class="w-64 h-auto rounded-lg overflow-hidden shadow-xl mb-6" data-astro-cid-bebynwvh> <img class="w-full h-auto transform hover:scale-105 transition-all duration-300"${addAttribute(`https://image.tmdb.org/t/p/w500${item?.poster_path}`, "src")}${addAttribute(item?.name, "alt")} data-astro-cid-bebynwvh> </div> <div class="flex flex-col gap-4 w-full" data-astro-cid-bebynwvh>  <form method="POST" class="w-full" data-astro-cid-bebynwvh> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="name"${addAttribute(item?.name || "Sin nombre", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="first_air_date"${addAttribute(item?.first_air_date || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="status"${addAttribute(item?.status || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="action"${addAttribute(isInFavorites ? "remove" : "add", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="actionType" value="favs" data-astro-cid-bebynwvh> <input type="hidden" name="seasons"${addAttribute(JSON.stringify(item?.seasons || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="last_episode_to_air"${addAttribute(JSON.stringify(item?.last_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="next_episode_to_air"${addAttribute(JSON.stringify(item?.next_episode_to_air || null), "value")} data-astro-cid-bebynwvh>  ${!isInFavorites && renderTemplate`<div class="mb-2" data-astro-cid-bebynwvh> <label for="custom-position" class="block text-sm font-medium text-gray-700 mb-1" data-astro-cid-bebynwvh>
Posición en favoritos (opcional)
</label> <input type="number" id="custom-position" name="custom_position" min="1" class="w-full px-3 py-2 border text-gray-600 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej: 1 para el inicio" data-astro-cid-bebynwvh> </div>`} ${isInFavorites ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-red-600 text-white text-lg rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Eliminar de lista de favoritos
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-blue-600 text-white text-lg rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Añadir a lista de favoritos
</button>`} </form>  <form method="POST" class="w-full" data-astro-cid-bebynwvh> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="name"${addAttribute(item?.name || "Sin nombre", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="first_air_date"${addAttribute(item?.first_air_date || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="status"${addAttribute(item?.status || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="action"${addAttribute(isInPendientes ? "remove" : "add", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="actionType" value="pendientes" data-astro-cid-bebynwvh> <input type="hidden" name="seasons"${addAttribute(JSON.stringify(item?.seasons || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="last_episode_to_air"${addAttribute(JSON.stringify(item?.last_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="next_episode_to_air"${addAttribute(JSON.stringify(item?.next_episode_to_air || null), "value")} data-astro-cid-bebynwvh> ${isInPendientes ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-orange-600 text-white text-lg rounded-lg shadow-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Eliminar de pendientes
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-yellow-500 text-white text-lg rounded-lg shadow-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Añadir a pendientes
</button>`} </form>  <form method="POST" class="w-full" data-astro-cid-bebynwvh> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="name"${addAttribute(item?.name || "Sin nombre", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="first_air_date"${addAttribute(item?.first_air_date || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="status"${addAttribute(item?.status || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="action"${addAttribute(isInSiguiendo ? "remove" : "add", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="actionType" value="siguiendo" data-astro-cid-bebynwvh> <input type="hidden" name="seasons"${addAttribute(JSON.stringify(item?.seasons || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="last_episode_to_air"${addAttribute(JSON.stringify(item?.last_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="next_episode_to_air"${addAttribute(JSON.stringify(item?.next_episode_to_air || null), "value")} data-astro-cid-bebynwvh> ${isInSiguiendo ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-purple-600 text-white text-lg rounded-lg shadow-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2" data-astro-cid-bebynwvh> <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" data-astro-cid-bebynwvh></path> <path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" data-astro-cid-bebynwvh></path> <path d="M3 3l18 18" data-astro-cid-bebynwvh></path> </svg>
Dejar de seguir
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-indigo-500 text-white text-lg rounded-lg shadow-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2" data-astro-cid-bebynwvh> <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" data-astro-cid-bebynwvh></path> <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" data-astro-cid-bebynwvh></path> </svg>
Marcar siguiendo
</button>`} </form>  <form method="POST" class="w-full" data-astro-cid-bebynwvh> <input type="hidden" name="id"${addAttribute(item?.id, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="poster_path"${addAttribute(item?.poster_path || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="name"${addAttribute(item?.name || "Sin nombre", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="vote_average"${addAttribute(item?.vote_average || 0, "value")} data-astro-cid-bebynwvh> <input type="hidden" name="overview"${addAttribute(item?.overview || "Sin descripci\xF3n", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="genres"${addAttribute(JSON.stringify(item?.genres || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="first_air_date"${addAttribute(item?.first_air_date || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="status"${addAttribute(item?.status || "", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="action"${addAttribute(isInVistas ? "remove" : "add", "value")} data-astro-cid-bebynwvh> <input type="hidden" name="actionType" value="vistas" data-astro-cid-bebynwvh> <input type="hidden" name="seasons"${addAttribute(JSON.stringify(item?.seasons || []), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="last_episode_to_air"${addAttribute(JSON.stringify(item?.last_episode_to_air || null), "value")} data-astro-cid-bebynwvh> <input type="hidden" name="next_episode_to_air"${addAttribute(JSON.stringify(item?.next_episode_to_air || null), "value")} data-astro-cid-bebynwvh> ${isInVistas ? renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-red-600 text-white text-lg rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-4.707-5.293a1 1 0 001.414 0L10 9.414l3.293 3.293a1 1 0 001.414-1.414l-4-4a1 1 0 00-1.414 0l-4 4a1 1 0 000 1.414z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Eliminar de vistas
</button>` : renderTemplate`<button type="submit" class="w-full px-6 py-3 bg-green-600 text-white text-lg rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 flex items-center justify-center gap-2" aria-live="polite" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" data-astro-cid-bebynwvh> <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" data-astro-cid-bebynwvh></path> </svg>
Marcar como vista
</button>`} </form> ${(item?.homepage || trailerUrl) && renderTemplate`<a${addAttribute(item?.homepage || trailerUrl, "href")} class="w-full px-6 py-3 bg-pink-600 text-white text-lg rounded-lg shadow-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all duration-300 flex items-center justify-center gap-2" target="_blank" rel="noopener" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" data-astro-cid-bebynwvh></path> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" data-astro-cid-bebynwvh></path> </svg>
Ver ahora
</a>`} </div> <!-- Info Cards --> <div class="mt-8 w-full space-y-4" data-astro-cid-bebynwvh> <div class="bg-white p-4 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h3 class="text-lg font-bold text-blue-600 mb-2" data-astro-cid-bebynwvh>Información</h3> <ul class="space-y-2" data-astro-cid-bebynwvh> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>Estado:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${statusMap[status] || status}</span> </li> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>Estreno:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${formatDate(item?.first_air_date)}</span> </li> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>Temporadas:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${item?.seasons?.length || 0}</span> </li> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>Episodios:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${totalEpisodes}</span> </li> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>Idioma original:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${languageMap[item?.original_language] || item?.original_language}</span> </li> <li class="flex justify-between" data-astro-cid-bebynwvh> <span class="text-gray-600" data-astro-cid-bebynwvh>País:</span> <span class="font-medium text-gray-600" data-astro-cid-bebynwvh>${item?.origin_country?.join(", ") || "No disponible"}</span> </li> </ul> </div> ${item?.languages && item.languages.length > 0 && renderTemplate`<div class="bg-white p-4 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h3 class="text-lg font-bold text-blue-600 mb-2" data-astro-cid-bebynwvh>Idiomas disponibles</h3> <div class="flex flex-wrap gap-2" data-astro-cid-bebynwvh> ${item.languages.map((language) => renderTemplate`<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs" data-astro-cid-bebynwvh> ${languageMap[language] || language} </span>`)} </div> </div>`} </div> </div> <!-- Columna Derecha: Detalles --> <div class="md:w-2/3" data-astro-cid-bebynwvh> <!-- Sinopsis --> <div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Sinopsis</h2> <p class="text-gray-700 leading-relaxed" data-astro-cid-bebynwvh>${item?.overview || "No hay sinopsis disponible."}</p> </div> <!-- Trailer --> ${trailerUrl && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Trailer</h2> <div class="aspect-video w-full" data-astro-cid-bebynwvh> <iframe class="w-full h-full rounded"${addAttribute(formatTrailerUrl(trailerUrl), "src")} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-astro-cid-bebynwvh></iframe> </div> </div>`} <!-- Episodios recientes y próximos --> <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" data-astro-cid-bebynwvh> ${item?.last_episode_to_air && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h3 class="text-xl font-bold text-blue-600 mb-2" data-astro-cid-bebynwvh>Último episodio</h3> <div class="space-y-2" data-astro-cid-bebynwvh> <p class="font-medium text-gray-600" data-astro-cid-bebynwvh>${item.last_episode_to_air.name}</p> <p class="text-sm text-gray-600" data-astro-cid-bebynwvh>T${item.last_episode_to_air.season_number}
E${item.last_episode_to_air.episode_number}</p> <p class="text-sm text-gray-600" data-astro-cid-bebynwvh>${formatDate(item.last_episode_to_air.air_date)}</p> ${item.last_episode_to_air.still_path && renderTemplate`<img${addAttribute(`https://image.tmdb.org/t/p/w300${item.last_episode_to_air.still_path}`, "src")}${addAttribute(item.last_episode_to_air.name, "alt")} loading="lazy" class="w-full h-auto rounded mt-2" data-astro-cid-bebynwvh>`} </div> </div>`} ${item?.next_episode_to_air && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h3 class="text-xl font-bold text-blue-600 mb-2" data-astro-cid-bebynwvh>Próximo episodio</h3> <div class="space-y-2 text-gray-600" data-astro-cid-bebynwvh> <p class="font-medium" data-astro-cid-bebynwvh>${item.next_episode_to_air.name}</p> <p class="text-sm" data-astro-cid-bebynwvh>T${item.next_episode_to_air.season_number}
E${item.next_episode_to_air.episode_number}</p> <p class="text-sm text-gray-600" data-astro-cid-bebynwvh>${formatDate(item.next_episode_to_air.air_date)}</p> ${item.next_episode_to_air.still_path && renderTemplate`<img${addAttribute(`https://image.tmdb.org/t/p/w300${item.next_episode_to_air.still_path}`, "src")}${addAttribute(item.next_episode_to_air.name, "alt")} loading="lazy" class="w-full h-auto rounded mt-2" data-astro-cid-bebynwvh>`} </div> </div>`} </div> <!-- Temporadas con acordeón para episodios --> <div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Temporadas</h2> <div class="space-y-6" data-astro-cid-bebynwvh> ${sortedSeasons.filter((season) => season.season_number !== 0).map((season) => renderTemplate`<details class="border border-blue-100 rounded-lg overflow-hidden" data-astro-cid-bebynwvh> <summary class="cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors p-4" data-astro-cid-bebynwvh> <div class="flex flex-col md:flex-row gap-4 items-center" data-astro-cid-bebynwvh> <div class="md:w-1/4 w-full max-w-[200px]" data-astro-cid-bebynwvh> <img${addAttribute(`https://image.tmdb.org/t/p/w300${season.poster_path || item?.poster_path}`, "src")}${addAttribute(`Temporada ${season.season_number}`, "alt")} loading="lazy" class="w-full h-auto rounded-lg shadow-md transform hover:scale-105 transition-transform" data-astro-cid-bebynwvh> </div> <div class="md:w-3/4 w-full" data-astro-cid-bebynwvh> <h3 class="text-xl font-bold text-blue-800 mb-2" data-astro-cid-bebynwvh>
Temporada ${season.season_number} </h3> <div class="flex items-center gap-3 text-sm text-gray-600 mb-2" data-astro-cid-bebynwvh> <span class="flex items-center gap-1" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" data-astro-cid-bebynwvh></path> </svg> ${season.episode_count} episodios
</span> <span class="flex items-center gap-1" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" data-astro-cid-bebynwvh></path> </svg> ${formatDate(season.air_date)} </span> </div> <p class="text-sm text-gray-700 line-clamp-3" data-astro-cid-bebynwvh> ${season.overview || "No hay descripci\xF3n disponible para esta temporada."} </p> </div> </div> </summary> <!-- Lista de episodios para cada temporada --> <div class="bg-white p-4" data-astro-cid-bebynwvh> <div class="space-y-3" data-astro-cid-bebynwvh> ${allSeasonEpisodes[season.season_number]?.map((episode) => renderTemplate`<details class="border-b border-gray-200 pb-3 last:border-0 group" data-astro-cid-bebynwvh> <summary class="cursor-pointer py-2 flex items-center justify-between hover:bg-blue-50 rounded-lg px-3 transition-colors" data-astro-cid-bebynwvh> <div class="flex items-center gap-3 w-full" data-astro-cid-bebynwvh> <span class="bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded text-sm w-8 text-center flex-shrink-0" data-astro-cid-bebynwvh> ${episode.episode_number} </span> <div class="flex-grow" data-astro-cid-bebynwvh> <h5 class="font-medium text-gray-800 text-base" data-astro-cid-bebynwvh>${episode.name}</h5> <div class="text-xs text-gray-500 flex items-center gap-2 mt-1" data-astro-cid-bebynwvh> <span class="flex items-center gap-1" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" data-astro-cid-bebynwvh></path> </svg> ${formatDate(episode.air_date)} </span> ${episode.runtime && renderTemplate`<span class="flex items-center gap-1" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" data-astro-cid-bebynwvh></path> </svg> ${formatRuntime(episode.runtime)} </span>`} ${episode.vote_average > 0 && renderTemplate`<span class="flex items-center gap-1" data-astro-cid-bebynwvh> <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-yellow-500" fill="currentColor" viewBox="0 0 24 24" data-astro-cid-bebynwvh> <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" data-astro-cid-bebynwvh></path> </svg> ${episode.vote_average.toFixed(1)} </span>`} </div> </div> <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-astro-cid-bebynwvh> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" data-astro-cid-bebynwvh></path> </svg> </div> </summary> <div class="mt-2 px-3 py-2 bg-blue-50 rounded-lg" data-astro-cid-bebynwvh> <div class="flex gap-4" data-astro-cid-bebynwvh> ${episode.still_path && renderTemplate`<div class="w-1/3 flex-shrink-0" data-astro-cid-bebynwvh> <img${addAttribute(`https://image.tmdb.org/t/p/w300${episode.still_path}`, "src")}${addAttribute(episode.name, "alt")} loading="lazy" class="rounded-lg shadow-md w-full h-auto object-cover" data-astro-cid-bebynwvh> </div>`} <div class="flex-grow" data-astro-cid-bebynwvh> <p class="text-sm text-gray-700 mb-2" data-astro-cid-bebynwvh> ${episode.overview || "No hay descripci\xF3n disponible para este episodio."} </p> ${episode.guest_stars && episode.guest_stars.length > 0 && renderTemplate`<div class="mt-2" data-astro-cid-bebynwvh> <h6 class="text-sm font-semibold text-blue-700 mb-1" data-astro-cid-bebynwvh>Estrellas invitadas:</h6> <ul class="text-xs text-gray-600 list-disc list-inside" data-astro-cid-bebynwvh> ${episode.guest_stars.map((star) => renderTemplate`<li data-astro-cid-bebynwvh>${star.name} como ${star.character}</li>`)} </ul> </div>`} </div> </div> </div> </details>`)} ${(!allSeasonEpisodes[season.season_number] || allSeasonEpisodes[season.season_number].length === 0) && renderTemplate`<p class="text-gray-500 italic text-center p-4" data-astro-cid-bebynwvh>
No hay información de episodios disponible para esta temporada.
</p>`} </div> </div> </details>`)} </div> </div> <!-- Pósters --> <div class="bg-white p-6 rounded-lg shadow-md mb-8" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Pósters</h2> ${posters && posters.length > 0 ? renderTemplate`<div class="carousel-container relative max-w-full overflow-hidden" data-astro-cid-bebynwvh> <div class="carousel-track flex gap-4 overflow-x-auto pb-4 scrollbar-hide" data-astro-cid-bebynwvh> ${posters.slice(0, 40).map((poster, index) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-bebynwvh": true }, { "default": async ($$result3) => renderTemplate` <div class="carousel-slide flex-shrink-0 w-48" data-astro-cid-bebynwvh> <a${addAttribute(`#poster-${index}`, "href")} data-astro-cid-bebynwvh> <img${addAttribute(poster.file_path, "src")}${addAttribute(`P\xF3ster ${poster.vote_average.toFixed(1)}/10`, "alt")} loading="lazy" class="rounded-lg shadow-md w-full h-64 object-cover" data-astro-cid-bebynwvh> </a> </div> <div${addAttribute(`poster-${index}`, "id")} class="modal" data-astro-cid-bebynwvh> <a href="#" class="modal-close" data-astro-cid-bebynwvh>&times;</a> <img${addAttribute(poster.file_path, "src")}${addAttribute(`P\xF3ster ${poster.vote_average.toFixed(1)}/10`, "alt")} data-astro-cid-bebynwvh> </div> ` })}`)} </div> </div>` : renderTemplate`<p class="text-gray-600 text-center" data-astro-cid-bebynwvh>No se encontraron pósters para esta serie</p>`} </div> <!-- Reparto y Equipo --> <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" data-astro-cid-bebynwvh>  <div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Reparto</h2> <div class="text-gray-600" data-astro-cid-bebynwvh> ${cast?.length > 0 ? renderTemplate`<ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-astro-cid-bebynwvh> ${cast.map((actor) => renderTemplate`<li class="border-b border-gray-100 py-1 last:border-0" data-astro-cid-bebynwvh> <a${addAttribute(`/actor/${actor}`, "href")} class="text-gray-600 hover:text-blue-600 hover:underline transition duration-300" data-astro-cid-bebynwvh> ${actor} </a> </li>`)} </ul>` : renderTemplate`<p class="text-gray-500" data-astro-cid-bebynwvh>Información no disponible</p>`} </div> </div> <!-- Equipo --> <div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Equipo</h2> <div class="text-gray-600" data-astro-cid-bebynwvh> ${directors?.length > 0 ? renderTemplate`<ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-astro-cid-bebynwvh> ${directors.map((director) => renderTemplate`<li class="border-b border-gray-100 py-1 last:border-0" data-astro-cid-bebynwvh> <span class="font-medium" data-astro-cid-bebynwvh>${director.job}: </span> <span data-astro-cid-bebynwvh>${director.name}</span> </li>`)} </ul>` : renderTemplate`<p class="text-gray-500" data-astro-cid-bebynwvh>Información no disponible</p>`} </div> </div> </div> <!-- Plataformas y Productoras en dos columnas --> <div class="grid grid-cols-1 md:grid-cols-2 gap-6" data-astro-cid-bebynwvh> <!-- Plataformas --> ${providerElements.length > 0 && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Disponible en</h2> <div class="grid grid-cols-3 sm:grid-cols-3 gap-4" data-astro-cid-bebynwvh> ${providerElements.map((provider) => renderTemplate`<div class="flex flex-col items-center" data-astro-cid-bebynwvh> ${provider.logo ? provider.link ? renderTemplate`<a${addAttribute(provider.link, "href")} target="_blank" rel="noopener noreferrer" data-astro-cid-bebynwvh> <img${addAttribute(provider.logo, "src")}${addAttribute(provider.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-bebynwvh> </a>` : renderTemplate`<img${addAttribute(provider.logo, "src")}${addAttribute(provider.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-bebynwvh>` : renderTemplate`<div class="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center mb-2" data-astro-cid-bebynwvh> <span class="text-xs text-gray-500" data-astro-cid-bebynwvh>Sin logo</span> </div>`} <p class="text-xs text-center text-gray-600" data-astro-cid-bebynwvh>${provider.name}</p> </div>`)} </div> </div>`} <!-- Productoras --> ${item?.production_companies && item.production_companies.length > 0 && renderTemplate`<div class="bg-white p-6 rounded-lg shadow-md" data-astro-cid-bebynwvh> <h2 class="text-2xl font-bold text-blue-600 mb-4" data-astro-cid-bebynwvh>Productoras</h2> <div class="grid grid-cols-3 sm:grid-cols-3 gap-4" data-astro-cid-bebynwvh> ${item.production_companies.map((company) => renderTemplate`<div class="flex flex-col items-center" data-astro-cid-bebynwvh> ${company?.logo_path ? renderTemplate`<img${addAttribute(`https://image.tmdb.org/t/p/w200${company.logo_path}`, "src")}${addAttribute(company.name, "alt")} loading="lazy" class="w-16 h-16 object-contain rounded-md mb-2 hover:scale-105 transition-all" data-astro-cid-bebynwvh>` : renderTemplate`<div class="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center mb-2" data-astro-cid-bebynwvh> <span class="text-xs text-gray-500" data-astro-cid-bebynwvh>Sin logo</span> </div>`} <p class="text-xs text-center text-gray-500" data-astro-cid-bebynwvh>${company.name}</p> </div>`)} </div> </div>`} </div> </div> </div> </div> </article> ` })} `;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/serie/[id].astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/serie/[id].astro";
const $$url = "/serie/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$id,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
