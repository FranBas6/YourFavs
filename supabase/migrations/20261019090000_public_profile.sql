-- =====================================================================================
-- YourFavs · Perfil público (F1 de la capa social, docs/PLAN_SOCIAL.md y el handoff
-- docs/design_handoff_perfil_publico/README.md §5).
--
-- Todo lo del perfil público vive en `profiles`, una fila por usuario, con el prefijo
-- `public_` para que se distinga de un vistazo de lo privado.
--
-- Seguridad: NO se abre ninguna política a `anon` ni se añade lectura cruzada. El perfil de
-- otra persona lo lee el servidor con la clave secreta, DESPUÉS de comprobar la visibilidad
-- (src/services/BD/social/publicProfile.ts), y solo con columnas en lista blanca. El
-- navegador nunca habla con Supabase.
-- =====================================================================================

alter table public.profiles
  -- Dirección pública: /u/{public_handle}. Única sin distinguir mayúsculas (índice abajo).
  add column public_handle            text,
  -- Solo se puede cambiar cada 30 días. El PRIMER handle no cuenta: se queda en null.
  add column public_handle_changed_at timestamptz,
  -- 'friends' existe ya en el CHECK pero la API lo rechaza hasta la F3 (amistad).
  add column public_visibility        text not null default 'off'
             check (public_visibility in ('off', 'public', 'friends')),
  -- Cuándo pasó a público por última vez: la banda del dueño dice «acaba de hacerse público».
  add column public_since             timestamptz,
  add column public_bio               text check (char_length(public_bio) <= 280),
  -- «Mis 4»: [{media_type, tmdb_id, title, poster_path, year}], copia al elegir (como
  -- custom_list_items) para pintar la cabecera sin llamar a TMDB.
  add column public_four              jsonb not null default '[]'
             check (jsonb_typeof(public_four) = 'array' and jsonb_array_length(public_four) <= 4),
  -- Secciones y su orden: el orden del array es el de la página.
  add column public_sections          jsonb not null default
             '[{"id":"favs","on":true},{"id":"log","on":true},{"id":"best","on":true},{"id":"collections","on":true},{"id":"common","on":false}]'
             check (jsonb_typeof(public_sections) = 'array'),
  add column public_indexable         boolean not null default false,
  -- Arquetipo cinéfilo ya calculado {name, icon, description, computed_at}. Calcularlo pide las
  -- stats de toda la biblioteca y varios segundos de TMDB, con la sesión del dueño: se guarda
  -- aquí cuando el dueño visita su perfil y el visitante solo lo lee.
  add column public_archetype         jsonb,
  add constraint public_handle_format check (public_handle ~ '^[a-z0-9_]{3,20}$');

create unique index profiles_public_handle_unique on public.profiles (lower(public_handle))
  where public_handle is not null;

-- -------------------------------------------------------------------------------------
-- Colecciones públicas: el dueño marca cuáles enseña en su perfil.
-- -------------------------------------------------------------------------------------
alter table public.custom_lists add column is_public boolean not null default false;

-- -------------------------------------------------------------------------------------
-- Títulos ocultos del perfil. Solo afectan a las secciones AUTOMÁTICAS («Lo último visto» y
-- «Mejor valoradas»): lo que el dueño elige a mano (Mis 4, colecciones públicas) no se filtra.
-- Título y póster van copiados para pintar la lista en Ajustes sin pedir nada a TMDB.
-- -------------------------------------------------------------------------------------
create table public.profile_hidden_titles (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type  public.media_type not null,
  tmdb_id     integer not null,
  title       text,
  poster_path text,
  hidden_at   timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

alter table public.profile_hidden_titles enable row level security;

create policy "profile_hidden_titles: solo tus filas" on public.profile_hidden_titles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
