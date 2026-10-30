-- =====================================================================================
-- YourFavs · TMDB C4 (2026-10-29): copia compartida de las fichas de TMDB, solo mientras
-- TMDB dice que son válidas.
--
-- Por qué: `/mislistas/{favoritos,pendientes,vistos,megusta}` pedía a TMDB el detalle de CADA
-- título en CADA visita (~180 llamadas con unos favoritos grandes; 5-7 s si TMDB no los tiene en
-- su caché). La regla de Fran: las listas muestran SIEMPRE lo último de TMDB.
--
-- Cómo se cumple: TMDB sirve el detalle desde su CDN con `Cache-Control: max-age` (hoy 2-7 h) y
-- `Age`; durante ese tiempo volver a pedírselo devuelve exactamente la misma respuesta. Cada fila
-- guarda una respuesta hasta `expires_at` = momento de la petición + (max-age − age), ni un segundo
-- más. Sin cabecera de caché no se guarda. Así nunca se enseña nada más viejo que lo que TMDB
-- devolvería en ese momento.
--
-- Una fila por título e idioma, compartida por todos (es dato público de TMDB). Como `app_state`,
-- solo la lee y escribe el servidor con la clave secreta: RLS activo y sin políticas.
-- =====================================================================================

create table public.tmdb_cache (
  media_type public.media_type not null,
  tmdb_id    integer not null,
  language   text not null,
  data       jsonb not null,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key (media_type, tmdb_id, language)
);

alter table public.tmdb_cache enable row level security;
-- Sin políticas: anon y authenticated no ven ni escriben nada; el servidor usa service_role.
