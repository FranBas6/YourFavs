// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import icon from 'astro-icon';


// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), react(), icon()],
  output: 'server',
  adapter: netlify(),
  // Compatibilidad tras renombrar rutas (Fase E): /personal/* → /mislistas/* y perfil → /perfil.
  // Explícitos (el spread en el destino no lo resuelve el adapter de Netlify).
  redirects: {
    '/personal/perfil': '/perfil',
    '/personal/favoritos': '/mislistas/favoritos',
    '/personal/megusta': '/mislistas/megusta',
    '/personal/vistos': '/mislistas/vistos',
    '/personal/pendientes': '/mislistas/pendientes',
    '/personal/verpronto': '/mislistas/verpronto',
    '/personal/siguiendo': '/mislistas/siguiendo',
    '/personal/actores': '/mislistas/actores',
    '/personal/actividad': '/mislistas/actividad',
    '/personal/calendario': '/mislistas/calendario',
    '/personal/recomendaciones': '/mislistas/recomendaciones',
    '/personal/year': '/mislistas/year',
    '/personal/year/siempre': '/mislistas/year/siempre',
    '/personal/year/[year]': '/mislistas/year/[year]',
  },
});