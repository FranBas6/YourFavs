import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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
const getMovieFav = async () => {
  try {
    console.log("Intentando obtener películas favoritas...");
    const movieFavsRef = collection(db, "MovieFavs");
    const querySnapshot = await getDocs(movieFavsRef);
    console.log("Resultado de la consulta:", querySnapshot);
    if (querySnapshot.empty) {
      console.warn("No se encontraron películas favoritas.");
      return [];
    }
    const result = querySnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });
    return result;
  } catch (error) {
    console.error("Error al obtener las películas favoritas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getMoviesPendientes = async () => {
  try {
    console.log("Intentando obtener películas pendientes...");
    const moviesPendientesRef = collection(db, "MoviesPendientes");
    const querySnapshot = await getDocs(moviesPendientesRef);
    console.log("Resultado de la consulta:", querySnapshot);
    if (querySnapshot.empty) {
      console.warn("No se encontraron películas pendientes.");
      return [];
    }
    const result = querySnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });
    return result;
  } catch (error) {
    console.error("Error al obtener las películas pendientes:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const getMoviesVistas = async () => {
  try {
    console.log("Intentando obtener películas vistas...");
    const moviesVistasRef = collection(db, "MoviesVistas");
    const querySnapshot = await getDocs(moviesVistasRef);
    console.log("Resultado de la consulta:", querySnapshot);
    if (querySnapshot.empty) {
      console.warn("No se encontraron películas vistas.");
      return [];
    }
    const result = querySnapshot.docs.map((doc) => {
      return { id: doc.id, ...doc.data() };
    });
    return result;
  } catch (error) {
    console.error("Error al obtener las películas vistas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const getRecommendedMovies = async (limit = 20) => {
  try {
    console.log("Obteniendo películas recomendadas...");
    const [favoritas, vistas] = await Promise.all([
      getMovieFav(),
      getMoviesVistas()
    ]);
    const allMovieIds = /* @__PURE__ */ new Set();
    [...favoritas, ...vistas].forEach((movie) => {
      allMovieIds.add(movie.id);
    });
    console.log(`Se encontraron ${allMovieIds.size} películas únicas para generar recomendaciones`);
    if (allMovieIds.size === 0) {
      console.warn("No hay películas para generar recomendaciones.");
      return [];
    }
    const recommendationPromises = [];
    for (const movie of favoritas) {
      recommendationPromises.push(fetchRecommendationsForMovie(movie.id, 2));
    }
    for (const movie of vistas) {
      if (!favoritas.some((fav) => fav.id === movie.id)) {
        recommendationPromises.push(fetchRecommendationsForMovie(movie.id, 1));
      }
    }
    const allRecommendationsArrays = await Promise.all(recommendationPromises);
    let allRecommendations = [];
    allRecommendationsArrays.forEach((recommendations) => {
      allRecommendations = [...allRecommendations, ...recommendations];
    });
    const filteredRecommendations = allRecommendations.filter(
      (rec) => !allMovieIds.has(rec.id)
    );
    const uniqueRecommendations = removeDuplicatesAndCalculateScores(filteredRecommendations);
    uniqueRecommendations.sort((a, b) => (b.score || 0) - (a.score || 0));
    const limitedRecommendations = uniqueRecommendations.slice(0, limit);
    console.log(`Se generaron ${limitedRecommendations.length} recomendaciones de películas`);
    return limitedRecommendations;
  } catch (error) {
    console.error("Error al obtener películas recomendadas:", error);
    console.error("Detalles del error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return [];
  }
};
const fetchRecommendationsForMovie = async (movieId, weight = 1) => {
  try {
    const url = `${TMDB_BASE_URL}/movie/${movieId}/recommendations?api_key=${API_KEY}&language=es-ES`;
    const response = await axios.get(url);
    return response.data.results.map((item) => ({
      id: item.id.toString(),
      title: item.title,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      overview: item.overview,
      release_date: item.release_date,
      popularity: item.popularity,
      score: (item.vote_average * 0.5 + item.popularity * 0.2) * weight
      // Calcular puntuación ponderada
    }));
  } catch (error) {
    console.error(`Error al obtener recomendaciones para película ${movieId}:`, error);
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
const getLatestMovies = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const movies = Array.isArray(data.results) ? data.results : [];
    const today = /* @__PURE__ */ new Date();
    const oneWeekLater = /* @__PURE__ */ new Date();
    oneWeekLater.setDate(today.getDate() + 7);
    const filteredMovies = movies.filter((movie) => {
      if (!movie.release_date) return false;
      const releaseDate = new Date(movie.release_date);
      return releaseDate <= oneWeekLater;
    });
    return filteredMovies.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      const dateA = new Date(a.release_date || "");
      const dateB = new Date(b.release_date || "");
      return dateB.getTime() - dateA.getTime();
    });
  } catch (error) {
    console.error("Hubo un error al obtener las películas:", error);
    return [];
  }
};
const getMostPopularMovies = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const movies = Array.isArray(data.results) ? data.results : [];
    return movies.sort((a, b) => b.popularity - a.popularity);
  } catch (error) {
    console.error("Hubo un error al obtener las películas populares:", error);
    return [];
  }
};
const getTopRatedMovies = async ({ page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const movies = Array.isArray(data.results) ? data.results : [];
    const filteredMovies = movies.filter((movie) => {
      return (movie.vote_count ?? 0) >= 50;
    });
    return filteredMovies.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      return b.popularity - a.popularity;
    });
  } catch (error) {
    console.error("Hubo un error al obtener las películas mejor valoradas:", error);
    return [];
  }
};
const getMovieById = async ({ id }) => {
  const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${API_KEY}&language=es-ES`);
  const movie = await movieRes.json();
  const providersRes = await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${API_KEY}&language=es-ES`);
  const providers = await providersRes.json();
  const availablePlatforms = providers?.results?.ES?.flatrate || [];
  return {
    ...movie,
    providers: availablePlatforms
  };
};
const genreMap = {
  accion: 28,
  aventura: 12,
  animacion: 16,
  comedia: 35,
  crimen: 80,
  documental: 99,
  drama: 18,
  familia: 10751,
  fantasia: 14,
  historico: 36,
  terror: 27,
  musical: 10402,
  misterio: 9648,
  romance: 10749,
  ciencia_ficcion: 878,
  pelicula_tv: 10770,
  suspense: 53,
  belica: 10752,
  western: 37,
  proximamente: "upcoming"
};
const buildDiscoverUrl = (genreId, page) => `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=${page}`;
const buildUpcomingUrl = (page) => `https://api.themoviedb.org/3/movie/upcoming?api_key=${API_KEY}&language=es-ES&sort_by=popularity.desc&page=${page}`;
const isUpcomingMovie = (releaseDate) => {
  const today = /* @__PURE__ */ new Date();
  const movieDate = new Date(releaseDate);
  const oneMonthAgo = /* @__PURE__ */ new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);
  return movieDate >= oneMonthAgo;
};
const sortByExpectation = (a, b) => {
  if (b.popularity !== a.popularity) {
    return b.popularity - a.popularity;
  }
  return b.vote_average - a.vote_average;
};
const getMoviesByCategory = async (category, page = "1") => {
  const normalizedCategory = category.trim().toLowerCase();
  const genreOrUpcoming = genreMap[normalizedCategory];
  if (!genreOrUpcoming) {
    throw new Error(`Categoría no válida: ${category}`);
  }
  const url = genreOrUpcoming === "upcoming" ? buildUpcomingUrl(page) : buildDiscoverUrl(genreOrUpcoming, page);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.statusText}`);
    }
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    let movies = results;
    if (genreOrUpcoming === "upcoming") {
      movies = movies.filter((movie) => movie.release_date && isUpcomingMovie(movie.release_date));
    }
    return movies.sort(sortByExpectation);
  } catch (error) {
    console.error("Hubo un error al obtener las películas:", error);
    return [];
  }
};
const getMovieCast = async (movieId) => {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.cast) {
      console.error("No se encontró información del reparto");
      return [];
    }
    return data.cast.map((actor) => actor.name);
  } catch (error) {
    console.error("Error al obtener el reparto:", error);
    return [];
  }
};
const getMovieDirectorsAndRoles = async (movieId) => {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${API_KEY}&language=es-ES`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.crew) {
      console.error("No se encontró información del equipo");
      return [];
    }
    const relevantRoles = ["Producer", "Executive Producer", "Visual Effects", "Original Music Composer"];
    return data.crew.filter((member) => relevantRoles.includes(member.job)).map((person) => ({ name: person.name, job: person.job }));
  } catch (error) {
    console.error("Hubo un error al obtener los datos de los directores y roles de la película:", error);
    return [];
  }
};
const getMoviesByTitle = async ({ title, page }) => {
  const pageNumber = page || "1";
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&query=${title}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const movies = Array.isArray(data.results) ? data.results : [];
    return movies.sort((a, b) => b.popularity - a.popularity);
  } catch (error) {
    console.error("Hubo un error al obtener las películas:", error);
    return [];
  }
};
const getMovieTrailer = async (movieId) => {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${API_KEY}&language=es-ES`;
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
const fetchMoviesByProvider = async (providerId, page = "1", sortBy = "popularity", sortOrder = "desc") => {
  const sortMapping = {
    popularity: "popularity",
    vote_average: "vote_average",
    release_date: "release_date",
    title: "original_title"
  };
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-ES&page=${page}&with_watch_providers=${providerId}&watch_region=ES&sort_by=${sortMapping[sortBy]}.${sortOrder}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (error) {
    console.error(`Hubo un error al obtener películas del proveedor ${providerId}:`, error);
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
const getNetflixMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.NETFLIX, page, sortBy, sortOrder);
const getAmazonPrimeMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.AMAZON, page, sortBy, sortOrder);
const getDisneyPlusMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.DISNEY, page, sortBy, sortOrder);
const getHBOMaxMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.HBO, page, sortBy, sortOrder);
const getAppleTVMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.APPLE, page, sortBy, sortOrder);
const getMovistarPlusMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.MOVISTAR, page, sortBy, sortOrder);
const getFilminMovies = async (page, sortBy, sortOrder) => fetchMoviesByProvider(PROVIDERS.FILMIN, page, sortBy, sortOrder);
const fetchAllMoviePosters = async (movieId, language = "es-ES") => {
  const numericId = typeof movieId === "string" ? parseInt(movieId, 10) : movieId;
  const baseUrl = `https://api.themoviedb.org/3`;
  const fullImagePath = (path) => `https://image.tmdb.org/t/p/original${path}`;
  try {
    const movieImagesRes = await fetch(`${baseUrl}/movie/${numericId}/images?api_key=${API_KEY}`);
    const movieImagesData = await movieImagesRes.json();
    let posters = movieImagesData.posters || [];
    if (language !== "" && language !== "all") {
      posters = posters.filter((poster) => poster.iso_639_1 === language.split("-")[0] || poster.iso_639_1 === null);
    }
    return posters.map((poster) => ({
      ...poster,
      file_path: fullImagePath(poster.file_path)
    }));
  } catch (error) {
    console.error(`Error al obtener los pósters de la película ${numericId}:`, error);
    return [];
  }
};
const getMovieCollectionInfo = async (collectionId) => {
  const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${API_KEY}&language=es-ES`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      backdrop_path: data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null,
      overview: data.overview || null,
      parts: data.parts?.map((part) => ({
        id: part.id,
        title: part.title,
        poster_path: part.poster_path ? `https://image.tmdb.org/t/p/w200${part.poster_path}` : null,
        release_date: part.release_date
      })) || []
    };
  } catch (error) {
    console.error("Hubo un error al obtener la colección:", error);
    return null;
  }
};

export { getMoviesByCategory as a, getMostPopularMovies as b, getMovieById as c, getMovieCast as d, getMovieDirectorsAndRoles as e, getMovieTrailer as f, getMoviesByTitle as g, fetchAllMoviePosters as h, getMovieCollectionInfo as i, getNetflixMovies as j, getAmazonPrimeMovies as k, getDisneyPlusMovies as l, getHBOMaxMovies as m, getAppleTVMovies as n, getMovistarPlusMovies as o, getFilminMovies as p, getTopRatedMovies as q, getLatestMovies as r, getMovieFav as s, getMoviesPendientes as t, getMoviesVistas as u, getRecommendedMovies as v };
