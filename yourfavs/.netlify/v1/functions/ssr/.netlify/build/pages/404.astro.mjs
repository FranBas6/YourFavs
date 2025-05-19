/* empty css                                 */
import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
export { renderers } from '../renderers.mjs';

const $$404 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "404: No encontrado" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex flex-col items-center justify-center"> <h1 class="text-3xl font-bold text-blue-500 text-center">404</h1> <img src="https://midu.dev/images/this-is-fine-404.gif"> </div> ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/404.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/404.astro";
const $$url = "/404";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$404,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
