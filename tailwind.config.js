/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // Escala v2 (tokens --fs-* de tokens.css). Va en `extend` durante la migración: cerrar
      // theme.fontSize ahora borraría los text-sm/text-xs… que quedan. Se cierra al final (fase 9).
      fontSize: {
        micro: 'var(--fs-micro)', meta: 'var(--fs-meta)', ui: 'var(--fs-ui)', body: 'var(--fs-body)',
        sub: 'var(--fs-sub)', sec: 'var(--fs-sec)', page: 'var(--fs-page)',
      },
    },
  },
  plugins: [],
}
