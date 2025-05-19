/* empty css                                 */
import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$About = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$About;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Sobre YourFavs", "data-astro-cid-kh7btl4r": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="container mx-auto px-6 py-10 bg-light-gray min-h-screen" data-astro-cid-kh7btl4r> <h1 class="text-5xl font-extrabold mb-8 text-slate-800 text-center drop-shadow-lg animate-fade-in" data-astro-cid-kh7btl4r>
YourFavs: Tu Universo Cinematográfico Personal
</h1> <section class="max-w-3xl mx-auto mb-10 bg-white p-8 rounded-2xl shadow-xl border-l-8 border-indigo-500 hover:shadow-2xl transition" data-astro-cid-kh7btl4r> <h2 class="text-2xl font-semibold text-slate-700 mb-4" data-astro-cid-kh7btl4r>¿Qué es YourFavs?</h2> <p class="text-lg text-slate-600 leading-relaxed" data-astro-cid-kh7btl4r>
YourFavs es mucho más que una simple app de películas. Es tu santuario cinéfilo, donde tú decides qué guardar, cómo organizar y cuándo disfrutar.
                Aquí las historias viven para ti, con funciones pensadas para que todo esté a un clic: favoritas, pendientes, vistas, recomendaciones automáticas y mucho más.
</p> </section> <section class="grid md:grid-cols-3 gap-6 mb-10" data-astro-cid-kh7btl4r> <div class="bg-white rounded-2xl p-6 shadow-lg border-b-4 border-blue-400 hover:shadow-2xl hover:-translate-y-1 transition" data-astro-cid-kh7btl4r> <h3 class="text-xl font-semibold text-slate-700 mb-3" data-astro-cid-kh7btl4r>🎥 Explora</h3> <ul class="space-y-2 text-slate-600 text-sm" data-astro-cid-kh7btl4r> <li data-astro-cid-kh7btl4r>🌟 Películas y series populares del momento</li> <li data-astro-cid-kh7btl4r>🆕 Últimos lanzamientos en cine y TV</li> <li data-astro-cid-kh7btl4r>🏆 Rankings de lo más valorado por la comunidad</li> <li data-astro-cid-kh7btl4r>🔍 Búsqueda avanzada y detallada por título</li> <li data-astro-cid-kh7btl4r>📺 Filtros por plataformas como Netflix, HBO Max, Disney+ y más</li> </ul> </div> <div class="bg-white rounded-2xl p-6 shadow-lg border-b-4 border-green-400 hover:shadow-2xl hover:-translate-y-1 transition" data-astro-cid-kh7btl4r> <h3 class="text-xl font-semibold text-slate-700 mb-3" data-astro-cid-kh7btl4r>🗂️ Organiza</h3> <ul class="space-y-2 text-slate-600 text-sm" data-astro-cid-kh7btl4r> <li data-astro-cid-kh7btl4r>❤️ Guarda tus favoritos</li> <li data-astro-cid-kh7btl4r>👁️‍🗨️ Marca lo que ya has visto</li> <li data-astro-cid-kh7btl4r>⏳ Crea listas personalizadas (pendientes, siguiendo...)</li> <li data-astro-cid-kh7btl4r>📆 Calendario de estrenos de episodios y películas</li> <li data-astro-cid-kh7btl4r>📊 Consulta tus estadísticas personales</li> </ul> </div> <div class="bg-white rounded-2xl p-6 shadow-lg border-b-4 border-purple-400 hover:shadow-2xl hover:-translate-y-1 transition" data-astro-cid-kh7btl4r> <h3 class="text-xl font-semibold text-slate-700 mb-3" data-astro-cid-kh7btl4r>🧠 Descubre</h3> <ul class="space-y-2 text-slate-600 text-sm" data-astro-cid-kh7btl4r> <li data-astro-cid-kh7btl4r>✨ Recomendaciones basadas en tus gustos</li> <li data-astro-cid-kh7btl4r>🎭 Información de reparto y directores</li> <li data-astro-cid-kh7btl4r>🔗 Visualiza sagas y conexiones entre películas</li> <li data-astro-cid-kh7btl4r>🎞️ Mira trailers de YouTube directamente</li> <li data-astro-cid-kh7btl4r>📚 Explora por géneros como acción, comedia o misterio</li> </ul> </div> </section> <section class="bg-white p-8 rounded-2xl shadow-xl border-l-8 border-rose-400 hover:shadow-2xl transition mb-10" data-astro-cid-kh7btl4r> <h2 class="text-2xl font-semibold mb-4 text-slate-700" data-astro-cid-kh7btl4r>Tecnologías que lo hacen posible</h2> <div class="flex flex-wrap justify-center gap-4" data-astro-cid-kh7btl4r> <span class="tech-badge bg-blue-100 text-blue-800" data-astro-cid-kh7btl4r>🚀 Astro</span> <span class="tech-badge bg-cyan-100 text-cyan-800" data-astro-cid-kh7btl4r>🎨 Tailwind CSS</span> <span class="tech-badge bg-yellow-100 text-yellow-800" data-astro-cid-kh7btl4r>🔐 Firebase</span> <span class="tech-badge bg-red-100 text-red-800" data-astro-cid-kh7btl4r>🎬 TMDB API</span> <span class="tech-badge bg-purple-100 text-purple-800" data-astro-cid-kh7btl4r>📊 TypeScript</span> </div> </section> <footer class="text-center text-sm text-slate-500 mt-12" data-astro-cid-kh7btl4r>
Hecho con ❤️ por ti, para ti. Porque tu pasión por el cine y las series merece su propio universo.
</footer> </div>  ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/about.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/about.astro";
const $$url = "/about";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$About,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
