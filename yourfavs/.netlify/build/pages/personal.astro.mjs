/* empty css                                 */
import { e as createComponent, k as renderComponent, r as renderTemplate } from '../chunks/astro/server_B4GtA6XA.mjs';
import 'kleur/colors';
import { $ as $$Layout } from '../chunks/Layout_BE7GQMPS.mjs';
import { $ as $$Personal$1 } from '../chunks/Personal_Dd2fH5v4.mjs';
export { renderers } from '../renderers.mjs';

const $$Personal = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Personal" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Personal", $$Personal$1, {})} ` })}`;
}, "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/personal.astro", void 0);

const $$file = "C:/Users/pacop/Desktop/PROYECTOS/YOURFAVS/PRUEBAS/Yourfavs1.0/yourfavs/src/pages/personal.astro";
const $$url = "/personal";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Personal,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
