import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import axios from 'axios';

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
const getSerieFav = async () => {
  try {
    console.log("Intentando obtener series favoritas...");
    const seriesFavsRef = collection(db, "SeriesFavs");
    const q = query(seriesFavsRef, orderBy("position"));
    const querySnapshot = await getDocs(q);
    const result = [];
    querySnapshot.forEach((doc2) => {
      result.push({
        id: doc2.id,
        ...doc2.data()
      });
    });
    console.log("Resultado de la consulta:", result);
    if (result.length === 0) {
      console.warn("No se encontraron series favoritas.");
      return [];
    }
    const seriesWithOrder = result.map((series, index) => ({
      ...series,
      custom_order: series.position ?? index
    }));
    if (seriesWithOrder.every((series) => series.position === null || series.position === void 0)) {
      await Promise.all(
        seriesWithOrder.map((series, index) => {
          const serieRef = doc(db, "SeriesFavs", series.id);
          return updateDoc(serieRef, { position: index });
        })
      );
    }
    return seriesWithOrder;
  } catch (error) {
    console.error("Error al obtener las series favoritas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getSeriesPendientes = async () => {
  try {
    console.log("Intentando obtener series pendientes...");
    const seriesPendientesRef = collection(db, "SeriesPendiente");
    const querySnapshot = await getDocs(seriesPendientesRef);
    const result = [];
    querySnapshot.forEach((doc2) => {
      result.push({
        id: doc2.id,
        ...doc2.data()
      });
    });
    console.log("Resultado de la consulta:", result);
    if (result.length === 0) {
      console.warn("No se encontraron series pendientes.");
      return [];
    }
    return result;
  } catch (error) {
    console.error("Error al obtener las series pendientes:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getSeriesVistas = async () => {
  try {
    console.log("Intentando obtener series vistas...");
    const seriesVistasRef = collection(db, "SeriesVistas");
    const querySnapshot = await getDocs(seriesVistasRef);
    const result = [];
    querySnapshot.forEach((doc2) => {
      result.push({
        id: doc2.id,
        ...doc2.data()
      });
    });
    console.log("Resultado de la consulta:", result);
    if (result.length === 0) {
      console.warn("No se encontraron series vistas.");
      return [];
    }
    return result;
  } catch (error) {
    console.error("Error al obtener las series vistas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getSeriesSiguiendo = async () => {
  try {
    console.log("Intentando obtener series siguiendo...");
    const seriesSiguiendoRef = collection(db, "SeriesSiguiendo");
    const querySnapshot = await getDocs(seriesSiguiendoRef);
    const result = [];
    querySnapshot.forEach((doc2) => {
      result.push({
        id: doc2.id,
        ...doc2.data()
      });
    });
    console.log("Resultado de la consulta:", result);
    if (result.length === 0) {
      console.warn("No se encontraron series siguiendo.");
      return [];
    }
    return result;
  } catch (error) {
    console.error("Error al obtener las series siguiendo:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getLikedSeries = async () => {
  try {
    console.log("Intentando obtener series que te gustan...");
    const likedSeriesRef = collection(db, "LikedSeries");
    const querySnapshot = await getDocs(likedSeriesRef);
    const result = [];
    querySnapshot.forEach((doc2) => {
      result.push({
        id: doc2.id,
        ...doc2.data()
      });
    });
    console.log("Resultado de la consulta:", result);
    if (result.length === 0) {
      console.warn("No se encontraron series que te gustan.");
      return [];
    }
    return result;
  } catch (error) {
    console.error("Error al obtener las series siguiendo:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const getRecommendedSeries = async (limit = 20) => {
  try {
    console.log("Obteniendo series recomendadas...");
    const [favoritas, vistas, gustadas] = await Promise.all([
      getSerieFav(),
      getSeriesVistas(),
      getLikedSeries()
    ]);
    const allSeriesIds = /* @__PURE__ */ new Set();
    [...favoritas, ...vistas, ...gustadas].forEach((serie) => {
      allSeriesIds.add(serie.id);
    });
    console.log(`Se encontraron ${allSeriesIds.size} series únicas para generar recomendaciones`);
    if (allSeriesIds.size === 0) {
      console.warn("No hay series para generar recomendaciones.");
      return [];
    }
    const recommendationPromises = [];
    for (const serie of favoritas) {
      recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 2));
    }
    for (const serie of gustadas) {
      if (!favoritas.some((fav) => fav.id === serie.id)) {
        recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1.5));
      }
    }
    for (const serie of vistas) {
      if (!favoritas.some((fav) => fav.id === serie.id) && !gustadas.some((liked) => liked.id === serie.id)) {
        recommendationPromises.push(fetchRecommendationsForSeries(serie.id, 1));
      }
    }
    const allRecommendationsArrays = await Promise.all(recommendationPromises);
    let allRecommendations = [];
    allRecommendationsArrays.forEach((recommendations) => {
      allRecommendations = [...allRecommendations, ...recommendations];
    });
    const filteredRecommendations = allRecommendations.filter(
      (rec) => !allSeriesIds.has(rec.id)
    );
    const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);
    uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));
    const limitedRecommendations = uniqueRecommendations.slice(0, limit);
    console.log(`Se generaron ${limitedRecommendations.length} recomendaciones de series`);
    return limitedRecommendations;
  } catch (error) {
    console.error("Error al obtener series recomendadas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const fetchRecommendationsForSeries = async (seriesId, weight = 1) => {
  try {
    const url = `${TMDB_BASE_URL}/tv/${seriesId}/recommendations?api_key=${API_KEY}&language=es-ES`;
    const response = await axios.get(url);
    return response.data.results.map((item) => ({
      id: item.id.toString(),
      name: item.name,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      overview: item.overview,
      first_air_date: item.first_air_date,
      popularity: item.popularity,
      score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight
      // Calcular puntuación ponderada
    }));
  } catch (error) {
    console.error(`Error al obtener recomendaciones para serie ${seriesId}:`, error);
    return [];
  }
};
const removeDuplicatesAndCalculateScores = (recommendations) => {
  const uniqueMap = /* @__PURE__ */ new Map();
  recommendations.forEach((rec) => {
    const existingRec = uniqueMap.get(rec.id);
    if (existingRec) {
      const combinedScore = (existingRec.score || 0) + (rec.score || 0);
      uniqueMap.set(rec.id, {
        ...existingRec,
        score: combinedScore
      });
    } else {
      uniqueMap.set(rec.id, rec);
    }
  });
  return Array.from(uniqueMap.values());
};
const API_KEY = "6b8c2074bc39df249b521e6ac3fb731b";
const getLatestSeries = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const series = Array.isArray(data.results) ? data.results : [];
    const today = /* @__PURE__ */ new Date();
    const oneWeekLater = /* @__PURE__ */ new Date();
    oneWeekLater.setDate(today.getDate() + 7);
    const filteredSeries = series.filter((serie) => {
      const firstAirDate = serie.first_air_date ? new Date(serie.first_air_date) : null;
      const nextEpisodeDate = serie.next_episode_to_air?.air_date ? new Date(serie.next_episode_to_air.air_date) : null;
      if (firstAirDate && firstAirDate > oneWeekLater) {
        return false;
      }
      if (nextEpisodeDate && nextEpisodeDate > oneWeekLater) {
        return false;
      }
      return true;
    });
    return filteredSeries.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      const dateA = new Date(a.first_air_date || "");
      const dateB = new Date(b.first_air_date || "");
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error) {
    console.error("Hubo un error al obtener las series:", error);
    return [];
  }
};
const getMostPopularSeries = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const series = Array.isArray(data.results) ? data.results : [];
    return series.sort((a, b) => b.popularity - a.popularity);
  } catch (error) {
    console.error("Hubo un error al obtener las series populares:", error);
    return [];
  }
};
const getTopRatedSeries = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/tv/top_rated?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const series = Array.isArray(data.results) ? data.results : [];
    const filteredSeries = series.filter((serie) => {
      return (serie.vote_count ?? 0) >= 50;
    });
    return filteredSeries.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      return b.popularity - a.popularity;
    });
  } catch (error) {
    console.error("Hubo un error al obtener las series mejor valoradas:", error);
    return [];
  }
};
const getSeriesById = async ({ id }) => {
  const movieRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&language=es-ES`);
  const providersRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/watch/providers?api_key=${API_KEY}`);
  const movie = await movieRes.json();
  const providers = await providersRes.json();
  movie.providers = providers.results?.ES?.flatrate?.map((provider) => ({
    provider_id: provider.provider_id,
    provider_name: provider.provider_name,
    logo_path: provider.logo_path
  })) || [];
  return movie;
};
const genreMap = {
  accion: 10759,
  aventura: 10759,
  animacion: 16,
  comedia: 35,
  crimen: 80,
  documental: 99,
  drama: 18,
  familia: 10751,
  infantil: 10762,
  misterio: 9648,
  noticias: 10763,
  reality: 10764,
  ciencia_ficcion: 10765,
  fantasia: 10765,
  romance: 10749,
  telenovela: 10766,
  talkshow: 10767,
  terror: "horror",
  // Especial, ya que TMDB no tiene un género "terror" específico para TV
  guerra_politica: 10768,
  western: 37,
  proximamente: "on_the_air"
};
const buildDiscoverTvUrl = (genreId, page) => `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=${page}`;
const buildOnTheAirUrl = (page) => `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}&language=es-ES&page=${page}`;
const buildHorrorSearchUrl = (page) => `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-ES&query=horror&page=${page}`;
const sortByExpectation = (a, b) => {
  if (b.popularity !== a.popularity) {
    return b.popularity - a.popularity;
  }
  return b.vote_average - a.vote_average;
};
const getSeriesByCategory = async (category, page = "1") => {
  const normalizedCategory = category.trim().toLowerCase();
  const genreOrType = genreMap[normalizedCategory];
  if (!genreOrType) {
    throw new Error(`Categoría no válida: ${category}`);
  }
  let url;
  if (genreOrType === "on_the_air") {
    url = buildOnTheAirUrl(page);
  } else if (genreOrType === "horror") {
    url = buildHorrorSearchUrl(page);
  } else {
    url = buildDiscoverTvUrl(genreOrType, page);
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.statusText}`);
    }
    const data = await response.json();
    const series = Array.isArray(data.results) ? data.results : [];
    return series.sort(sortByExpectation);
  } catch (error) {
    console.error("Hubo un error al obtener las series:", error);
    return [];
  }
};
const getSeriesCast = async (tvId) => {
  const url = `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${API_KEY}&language=es-ES`;
  const response = await fetch(url);
  const data = await response.json();
  return data.cast.map((actor) => actor.name);
};
const getSeriesDirectorsAndRoles = async (tvId) => {
  const url = `https://api.themoviedb.org/3/tv/${tvId}/credits?api_key=${API_KEY}&language=es-ES`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.statusText}`);
    }
    const data = await response.json();
    const relevantRoles = ["Producer", "Executive Producer", "Visual Effects", "Original Music Composer"];
    return data.crew.filter((member) => relevantRoles.includes(member.job)).map((director) => ({ name: director.name, job: director.job }));
  } catch (error) {
    console.error("Hubo un error al obtener los datos de los directores y roles:", error);
    return [];
  }
};
const getSeriesByTitle = async ({ title, page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${title}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const series = Array.isArray(data.results) ? data.results : [];
    return series.sort((a, b) => b.popularity - a.popularity);
  } catch (error) {
    console.error("Hubo un error al obtener las series:", error);
    return [];
  }
};
const getSeriesTrailer = async (seriesId) => {
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/videos?api_key=${API_KEY}&language=es-ES`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const trailer = data.results.find((video) => video.type === "Trailer" && video.site === "YouTube");
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
  } catch (error) {
    console.error("Hubo un error al obtener el trailer:", error);
    return null;
  }
};
const getSeriesStatus = async (seriesId) => {
  const url = `https://api.themoviedb.org/3/tv/${seriesId}?api_key=${API_KEY}&language=es-ES`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const status = data.status;
    return status || null;
  } catch (error) {
    console.error("Hubo un error al obtener el estado de la serie:", error);
    return null;
  }
};
async function getEpisodesBySeasonNumber(serieId, seasonNumber) {
  try {
    const url = `https://api.themoviedb.org/3/tv/${serieId}/season/${seasonNumber}?api_key=${API_KEY}&language=es-ES`;
    console.log(`Intentando acceder a: ${url.replace(API_KEY, "API_KEY_HIDDEN")}`);
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error de API: ${response.status} - ${errorText}`);
      throw new Error(`Error obteniendo episodios: ${response.status}`);
    }
    const data = await response.json();
    console.log(`Datos obtenidos para temporada ${seasonNumber}, episodios: ${data.episodes?.length || 0}`);
    return data.episodes || [];
  } catch (error) {
    console.error("Error en getEpisodesBySeasonNumber:", error);
    return [];
  }
}
const fetchSeriesByProvider = async (providerId, page = "1", sortBy = "popularity", sortOrder = "desc") => {
  const sortMapping = {
    popularity: "popularity",
    vote_average: "vote_average",
    first_air_date: "first_air_date",
    name: "original_name"
  };
  const url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=${sortMapping[sortBy]}.${sortOrder}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (error) {
    console.error(`Hubo un error al obtener series del proveedor ${providerId}:`, error);
    return [];
  }
};
const PROVIDERS = {
  NETFLIX: 8,
  AMAZON: 119,
  DISNEY: 337,
  HBO: 1899,
  APPLE: 350,
  MOVISTAR: 2241,
  FILMIN: 63
};
const getNetflixSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.NETFLIX, page, sortBy, sortOrder);
const getAmazonPrimeSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.AMAZON, page, sortBy, sortOrder);
const getDisneyPlusSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.DISNEY, page, sortBy, sortOrder);
const getHBOMaxSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.HBO, page, sortBy, sortOrder);
const getAppleTVSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.APPLE, page, sortBy, sortOrder);
const getMovistarPlusSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.MOVISTAR, page, sortBy, sortOrder);
const getFilminSeries = async (page, sortBy, sortOrder) => fetchSeriesByProvider(PROVIDERS.FILMIN, page, sortBy, sortOrder);
const fetchAllSeriesPosters = async (serieId, language = "es-ES") => {
  const numericId = typeof serieId === "string" ? parseInt(serieId, 10) : serieId;
  const baseUrl = `https://api.themoviedb.org/3`;
  const fullImagePath = (path) => `https://image.tmdb.org/t/p/original${path}`;
  try {
    const seriesRes = await fetch(`${baseUrl}/tv/${numericId}?api_key=${API_KEY}`);
    const seriesData = await seriesRes.json();
    const seasons = seriesData.seasons || [];
    const seriesImagesRes = await fetch(`${baseUrl}/tv/${numericId}/images?api_key=${API_KEY}`);
    const seriesImagesData = await seriesImagesRes.json();
    let posters = seriesImagesData.posters || [];
    for (const season of seasons) {
      const seasonNumber = season.season_number;
      const seasonImagesRes = await fetch(`${baseUrl}/tv/${numericId}/season/${seasonNumber}/images?api_key=${API_KEY}`);
      const seasonImagesData = await seasonImagesRes.json();
      if (Array.isArray(seasonImagesData.posters)) {
        posters = posters.concat(seasonImagesData.posters);
      }
    }
    if (language !== "" && language !== "all") {
      posters = posters.filter((poster) => poster.iso_639_1 === language.split("-")[0] || poster.iso_639_1 === null);
    }
    return posters.map((poster) => ({
      ...poster,
      file_path: fullImagePath(poster.file_path)
    }));
  } catch (error) {
    console.error(`Error al obtener los pósters de la serie ${numericId}:`, error);
    return [];
  }
};

export { getSeriesByCategory as a, getMostPopularSeries as b, getNetflixSeries as c, getAmazonPrimeSeries as d, getDisneyPlusSeries as e, getHBOMaxSeries as f, getSeriesByTitle as g, getAppleTVSeries as h, getMovistarPlusSeries as i, getFilminSeries as j, getSeriesById as k, getSeriesCast as l, getSeriesDirectorsAndRoles as m, getSeriesTrailer as n, getSeriesStatus as o, getEpisodesBySeasonNumber as p, fetchAllSeriesPosters as q, getTopRatedSeries as r, getLatestSeries as s, getSerieFav as t, getSeriesPendientes as u, getSeriesVistas as v, getSeriesSiguiendo as w, getLikedSeries as x, getRecommendedSeries as y };
