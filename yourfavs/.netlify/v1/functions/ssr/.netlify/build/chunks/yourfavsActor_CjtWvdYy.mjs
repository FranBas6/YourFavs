const API_KEY = "6b8c2074bc39df249b521e6ac3fb731b";
const getSeriesByActorName = async ({ name }) => {
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
    const searchData = await searchRes.json();
    const person = searchData.results[0];
    if (!person) throw new Error("No se encontró la persona");
    const personId = person.id;
    const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}&language=es-ES`;
    const creditsRes = await fetch(creditsUrl);
    if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
    const creditsData = await creditsRes.json();
    const series = creditsData.cast.filter((item) => item.media_type === "tv");
    return series.sort((a, b) => {
      const popularityDiff = b.popularity - a.popularity;
      if (popularityDiff !== 0) return popularityDiff;
      return b.vote_average - a.vote_average;
    });
  } catch (error) {
    console.error("Hubo un error al obtener las series del actor:", error);
    return [];
  }
};
const getMoviesByActorName = async ({ name }) => {
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
    const searchData = await searchRes.json();
    const person = searchData.results[0];
    if (!person) throw new Error("No se encontró la persona");
    const personId = person.id;
    const creditsUrl = `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}&language=es-ES`;
    const creditsRes = await fetch(creditsUrl);
    if (!creditsRes.ok) throw new Error(`Error al obtener créditos: ${creditsRes.statusText}`);
    const creditsData = await creditsRes.json();
    const movies = creditsData.cast.filter((item) => item.media_type === "movie");
    return movies.sort((a, b) => {
      const popularityDiff = b.popularity - a.popularity;
      if (popularityDiff !== 0) return popularityDiff;
      return b.vote_average - a.vote_average;
    });
  } catch (error) {
    console.error("Hubo un error al obtener las películas del actor:", error);
    return [];
  }
};
const getActorDetails = async ({ name }) => {
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&api_key=${API_KEY}&language=es-ES`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`Error en la búsqueda: ${searchRes.statusText}`);
    const searchData = await searchRes.json();
    const persons = searchData.results;
    if (!persons || persons.length === 0) throw new Error("No se encontró ninguna persona");
    const sortedPersons = persons.sort((a, b) => b.popularity - a.popularity);
    const mostPopularPerson = sortedPersons[0];
    const personId = mostPopularPerson.id;
    const detailsUrl = `https://api.themoviedb.org/3/person/${personId}?api_key=${API_KEY}&language=es-ES`;
    const detailsRes = await fetch(detailsUrl);
    if (!detailsRes.ok) throw new Error(`Error al obtener los detalles: ${detailsRes.statusText}`);
    const actorDetails = await detailsRes.json();
    return {
      id: actorDetails.id,
      nombre: actorDetails.name,
      biografia: actorDetails.biography,
      lugarNacimiento: actorDetails.place_of_birth,
      fechaNacimiento: actorDetails.birthday,
      imagen: actorDetails.profile_path,
      // Solo devuelve la ruta, no la URL completa
      popularidad: actorDetails.popularity,
      conocidoPor: actorDetails.known_for_department
    };
  } catch (error) {
    console.error("Hubo un error al obtener los detalles del actor:", error);
    return null;
  }
};
const getActorsByName = async ({ name, page }) => {
  const pageNumber = page || "1";
  const searchUrl = `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&query=${encodeURIComponent(name)}&language=es-ES&page=${pageNumber}`;
  try {
    const res = await fetch(searchUrl);
    if (!res.ok) {
      throw new Error(`Error en la solicitud: ${res.statusText}`);
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const actorDetailsList = await Promise.all(
      results.map(async (actor) => {
        const detailsUrl = `https://api.themoviedb.org/3/person/${actor.id}?api_key=${API_KEY}&language=es-ES`;
        const detailsRes = await fetch(detailsUrl);
        if (!detailsRes.ok) throw new Error(`Error al obtener detalles del actor ${actor.id}`);
        const actorDetails = await detailsRes.json();
        return {
          id: actorDetails.id,
          nombre: actorDetails.name,
          biografia: actorDetails.biography,
          lugarNacimiento: actorDetails.place_of_birth,
          fechaNacimiento: actorDetails.birthday,
          imagen: actorDetails.profile_path,
          popularidad: actorDetails.popularity,
          conocidoPor: actorDetails.known_for_department
        };
      })
    );
    return actorDetailsList.sort((a, b) => b.popularidad - a.popularidad);
  } catch (error) {
    console.error("Hubo un error al obtener los actores:", error);
    return [];
  }
};

export { getMoviesByActorName as a, getActorDetails as b, getActorsByName as c, getSeriesByActorName as g };
