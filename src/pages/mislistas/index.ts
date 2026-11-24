/**
 * `/mislistas` a secas (QA 8.5, H33): daba 404 y es la dirección que alguien escribiría o compartiría.
 * Lleva a la primera lista, Favoritos. Sin sesión, el middleware ya manda a entrar (con `next`).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ redirect }) => redirect('/mislistas/favoritos', 302);
