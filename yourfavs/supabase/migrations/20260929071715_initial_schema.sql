-- =====================================================================================
-- YourFavs · esquema inicial (migración desde Firestore)
--
-- Criterio: MIGRACIÓN FIEL. Cada colección de `users/{uid}/…` tiene su tabla con los mismos
-- campos, para que reescribir `src/services/BD/**` sea mecánico y la app se comporte igual.
-- Lo que se gana ya en esta fase sin cambiar el comportamiento:
--   · tipos de verdad: `tmdb_id integer` en todas partes (en Firestore era número en unas
--     colecciones y texto en otras) y `timestamptz` (había Timestamp, ISO y milisegundos);
--   · integridad: claves primarias que impiden duplicados y `on delete cascade` desde
--     `auth.users`, así que borrar una cuenta limpia todo sin `recursiveDelete`;
--   · índices pensados para las consultas que en Firestore leían colecciones enteras.
--
-- Seguridad: RLS en TODAS las tablas. Cada usuario solo ve y toca sus filas
-- (`user_id = (select auth.uid())`, forma cacheada: se evalúa una vez por consulta y no por
-- fila). Lo global (`app_state`) solo lo escribe el servidor con la clave secreta.
-- =====================================================================================

create type public.media_type as enum ('movie', 'tv');

-- -------------------------------------------------------------------------------------
-- Utilidades
-- -------------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Perfil (antes: documento raíz users/{uid})
-- -------------------------------------------------------------------------------------

create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text,
  avatar_url               text,
  region                   text,
  language                 text,
  theme                    text check (theme in ('light', 'dark', 'system')),
  email                    text,
  onboarding               text check (onboarding in ('done', 'skipped')),
  platforms                integer[],
  platforms_filter_default boolean,
  notif_prefs              jsonb,
  spoiler_free             boolean,   -- ajuste viejo, solo lectura (ver resolveSpoilerSettings)
  spoilers                 jsonb,
  home_layout              jsonb,
  -- uid de Firebase del que viene la cuenta. Solo lo usa la migración para casar datos.
  firebase_uid             text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cada alta en Auth crea su fila de perfil (vacía), como en OnMyMind.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------------------
-- Listas fijas (antes: MovieFavs, MoviesVistas, SeriesSiguiendo… — 13 colecciones)
--
-- Una sola tabla y `collection` con el MISMO nombre que la colección de Firestore, a
-- propósito: `stateTransitions.ts`, los LIST_TYPE_MAP y todos los handlers siguen hablando
-- de 'MovieFavs' o 'SeriesSiguiendo' sin traducir nada.
--
-- `opinion` y `rating` se siguen copiando en cada lista donde está el título, como hoy:
-- es lo que hace la app y cambiarlo ahora sería cambiar comportamiento. En SQL mantener la
-- copia es un único UPDATE, no una lectura por colección.
-- -------------------------------------------------------------------------------------

create table public.library_items (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null check (collection in (
               'MovieFavs', 'MoviesPendientes', 'MoviesVistas', 'MoviesVerPronto', 'LikedMovies', 'MoviesViendo',
               'SeriesFavs', 'SeriesPendiente', 'SeriesVistas', 'SeriesSiguiendo', 'LikedSeries',
               'SeriesVerPronto', 'SeriesAbandonadas')),
  tmdb_id    integer not null,
  media_type public.media_type not null generated always as (
               case when collection in ('MovieFavs', 'MoviesPendientes', 'MoviesVistas',
                                        'MoviesVerPronto', 'LikedMovies', 'MoviesViendo')
                    then 'movie'::public.media_type
                    else 'tv'::public.media_type end) stored,
  added_at   timestamptz not null default now(),
  opinion    text,
  rating     numeric(3, 1) check (rating > 0 and rating <= 10),
  position   integer,            -- solo SeriesFavs (orden manual)
  primary key (user_id, collection, tmdb_id)
);

-- Listar una colección por fecha (getMovieCollection / getSeriesCollection).
create index library_items_by_date on public.library_items (user_id, collection, added_at desc);
-- "¿En qué listas está este título?" — hoy son 6-7 lecturas sueltas por ficha; aquí, una.
create index library_items_by_title on public.library_items (user_id, media_type, tmdb_id);

-- -------------------------------------------------------------------------------------
-- Progreso de episodios (antes: WatchedEpisodes/{serieId} con un array que crecía sin fin)
-- Ahora una fila por episodio visto. `last_watched` se deriva con max(watched_at).
-- -------------------------------------------------------------------------------------

create table public.watched_episodes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  serie_id   integer not null,
  season     smallint not null,
  episode    smallint not null,
  watched_at timestamptz,        -- nulo solo en históricos sin hora
  primary key (user_id, serie_id, season, episode)
);

-- -------------------------------------------------------------------------------------
-- Diario de visionado (antes: WatchLog, append-only). La colección más grande.
-- -------------------------------------------------------------------------------------

create table public.watch_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type public.media_type not null,
  tmdb_id    integer not null,
  season     smallint,
  episode    smallint,
  watched_on date not null,      -- el día elegido, no el instante del clic
  rewatch    boolean not null default false,
  note       text,
  logged_at  timestamptz not null default now(),
  source     text
);

-- Pases y contadores de una ficha (countMoviePasses, appendWatchLog…).
create index watch_log_by_title on public.watch_log (user_id, tmdb_id);
-- Mes a mes, Tu cine en números y Actividad: rangos de fechas por usuario.
create index watch_log_by_day on public.watch_log (user_id, watched_on);

-- -------------------------------------------------------------------------------------
-- Bitácora de acciones deliberadas (antes: Activity)
-- -------------------------------------------------------------------------------------

create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  verb       text not null check (verb in ('unwatch', 'remove', 'unfollow', 'reorder', 'abandon', 'resume')),
  media_type text not null check (media_type in ('movie', 'tv', 'person')),
  tmdb_id    integer not null,
  logged_at  timestamptz not null default now(),
  meta       jsonb
);

create index activity_by_date on public.activity (user_id, logged_at desc);

-- -------------------------------------------------------------------------------------
-- Notas (antes: Ratings/{type}_{id}) — el almacén con fechas que alimenta Actividad.
-- -------------------------------------------------------------------------------------

create table public.ratings (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type public.media_type not null,
  tmdb_id    integer not null,
  score      numeric(3, 1) not null check (score > 0 and score <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------------------
-- Etiquetas y notas privadas (antes: MediaTags/{type}_{id})
-- -------------------------------------------------------------------------------------

create table public.media_tags (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type public.media_type not null,
  tmdb_id    integer not null,
  tags       text[] not null default '{}',
  notes      text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

create trigger media_tags_set_updated_at
  before update on public.media_tags
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------------------
-- Modo sin spoilers por serie (antes: SpoilerPrefs/tv_{id})
-- -------------------------------------------------------------------------------------

create table public.spoiler_prefs (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id      integer not null,
  spoiler_free boolean not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

create trigger spoiler_prefs_set_updated_at
  before update on public.spoiler_prefs
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------------------
-- Personas (antes: ActorsFavs y FollowedPeople)
-- -------------------------------------------------------------------------------------

create table public.actor_favs (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id integer not null,
  added_at  timestamptz not null default now(),
  position  integer,
  primary key (user_id, person_id)
);

create table public.followed_people (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id    integer not null,
  name         text,
  profile_path text,
  added_at     timestamptz not null default now(),
  primary key (user_id, person_id)
);

-- -------------------------------------------------------------------------------------
-- Campana (antes: NotificationSubs y notifications)
-- -------------------------------------------------------------------------------------

create table public.notification_subs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type public.media_type not null,
  tmdb_id    integer not null,
  added_at   timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

create table public.notifications (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null,     -- id determinista del generador (evita duplicar avisos)
  type        text not null,
  title       text,
  subtitle    text,
  href        text,
  poster_path text,
  created_at  timestamptz not null default now(),
  read        boolean not null default false,
  primary key (user_id, id)
);

create index notifications_by_date on public.notifications (user_id, created_at desc);
-- El globo de la campana: contar no leídas sin leer las leídas.
create index notifications_unread on public.notifications (user_id) where not read;

-- -------------------------------------------------------------------------------------
-- Listas personalizadas (antes: customLists/{id} + subcolección items)
-- -------------------------------------------------------------------------------------

create table public.custom_lists (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Texto y no uuid: las listas migradas conservan su id de Firestore, que va en las URLs.
  -- Único POR USUARIO, no global: en Firestore colgaba de users/{uid}, y dos cuentas pueden
  -- tener el mismo id (pasa con las copiadas con scripts/clone-user.mjs).
  id          text not null default gen_random_uuid()::text,
  name        text not null,
  description text not null default '',
  icon        text,
  color_stamp text,
  cover       jsonb,
  item_count  integer not null default 0,   -- lo mantiene el trigger de custom_list_items
  position    integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index custom_lists_by_user on public.custom_lists (user_id, position);

create trigger custom_lists_set_updated_at
  before update on public.custom_lists
  for each row execute function public.set_updated_at();

create table public.custom_list_items (
  user_id     uuid not null default auth.uid(),
  list_id     text not null,
  media_type  public.media_type not null,
  tmdb_id     integer not null,
  title       text,
  poster_path text,
  position    integer,
  added_at    timestamptz not null default now(),
  primary key (user_id, list_id, media_type, tmdb_id),
  -- FK compuesta: un item solo puede colgar de una lista del MISMO usuario.
  foreign key (user_id, list_id) references public.custom_lists (user_id, id) on delete cascade
);

-- "¿En qué listas mías está este título?" (el popover de Guardar en…).
create index custom_list_items_by_title on public.custom_list_items (user_id, media_type, tmdb_id);

-- itemCount: antes un FieldValue.increment a mano en cada alta/baja; ahora no se desincroniza.
create function public.custom_lists_sync_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.custom_lists set item_count = item_count + 1 where user_id = new.user_id and id = new.list_id;
  elsif tg_op = 'DELETE' then
    update public.custom_lists set item_count = greatest(item_count - 1, 0) where user_id = old.user_id and id = old.list_id;
  end if;
  return null;
end;
$$;

create trigger custom_list_items_count
  after insert or delete on public.custom_list_items
  for each row execute function public.custom_lists_sync_count();

-- -------------------------------------------------------------------------------------
-- Estado suelto por usuario (antes: taste/current, notifMeta/providerState, meta/notifSync)
-- Documentos con forma libre que solo se leen y escriben enteros → jsonb con clave.
-- -------------------------------------------------------------------------------------

create table public.user_state (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null check (key in ('taste', 'notif_provider_state', 'notif_sync')),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create trigger user_state_set_updated_at
  before update on public.user_state
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------------------
-- Estado GLOBAL (antes: homeRows/hooks y homeRows/{ranking}) — filas de la portada que se
-- calculan una vez para todo el mundo. Las ve cualquiera (también invitados); solo las
-- escribe el servidor con la clave secreta.
-- -------------------------------------------------------------------------------------

create table public.app_state (
  key        text primary key,
  data       jsonb not null default '{}',
  claimed_at bigint not null default 0,     -- ms; cerrojo para que solo una función recalcule
  updated_at timestamptz not null default now()
);

create trigger app_state_set_updated_at
  before update on public.app_state
  for each row execute function public.set_updated_at();

-- Sustituye a la transacción de "claim" de hookRows/weeklyRanking: pide el cerrojo y
-- devuelve los datos si lo consigue, o NULL si otra función lo tiene desde hace < ttl.
-- Un solo UPDATE condicional es atómico: no hace falta transacción explícita.
create function public.claim_app_state(p_key text, p_ttl_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now  bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_data jsonb;
begin
  insert into public.app_state (key) values (p_key) on conflict (key) do nothing;
  update public.app_state
     set claimed_at = v_now
   where key = p_key
     and (claimed_at = 0 or v_now - claimed_at >= p_ttl_ms)
  returning data into v_data;
  return v_data;
end;
$$;

revoke execute on function public.claim_app_state(text, bigint) from public, anon, authenticated;
grant execute on function public.claim_app_state(text, bigint) to service_role;

-- -------------------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.library_items     enable row level security;
alter table public.watched_episodes  enable row level security;
alter table public.watch_log         enable row level security;
alter table public.activity          enable row level security;
alter table public.ratings           enable row level security;
alter table public.media_tags        enable row level security;
alter table public.spoiler_prefs     enable row level security;
alter table public.actor_favs        enable row level security;
alter table public.followed_people   enable row level security;
alter table public.notification_subs enable row level security;
alter table public.notifications     enable row level security;
alter table public.custom_lists      enable row level security;
alter table public.custom_list_items enable row level security;
alter table public.user_state        enable row level security;
alter table public.app_state         enable row level security;

-- El perfil se crea con el trigger, no desde el cliente: sin política de INSERT.
create policy "profiles: el tuyo" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: editar el tuyo" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Mismo patrón en todas las tablas por usuario: solo tus filas, para todo.
do $$
declare t text;
begin
  foreach t in array array[
    'library_items', 'watched_episodes', 'watch_log', 'activity', 'ratings', 'media_tags',
    'spoiler_prefs', 'actor_favs', 'followed_people', 'notification_subs', 'notifications',
    'custom_lists', 'custom_list_items', 'user_state'
  ] loop
    execute format(
      'create policy "%1$s: solo tus filas" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Portada global: lectura para todos; escritura solo con la clave secreta (sin políticas).
create policy "app_state: lectura pública" on public.app_state
  for select to anon, authenticated using (true);

-- -------------------------------------------------------------------------------------
-- Avatares (antes: base64 dentro de users/{uid}/media/avatar). Bucket privado: cada uno
-- sube a su carpeta `{uid}/…` y la ruta /api/profile/avatar/[uid] los sirve.
-- -------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "avatars: tu carpeta" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
