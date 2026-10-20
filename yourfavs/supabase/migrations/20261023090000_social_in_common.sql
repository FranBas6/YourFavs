-- =====================================================================================
-- YourFavs · Lo que compartes con tus amigos (F5 de la capa social, docs/PLAN_SOCIAL.md).
--
--   · «Amigos que la han visto» en las fichas      → social_friends_seen
--   · «En común contigo» en el perfil de un amigo  → social_in_common
--   · La ruleta «algo que los dos tenemos pendiente» → social_pending_common
--
-- Solo entre AMIGOS (seguir no basta), sin bloqueo en ningún sentido y con el perfil del amigo
-- encendido: quien apaga su perfil deja de enseñar nada, también a sus amigos. Los títulos que el
-- amigo ocultó de su perfil (profile_hidden_titles) no salen por ninguna de las tres.
--
-- Seguridad: como F2–F4, funciones `security definer` que solo puede ejecutar el servidor con la
-- clave secreta (service_role). No hay lectura cruzada ni políticas nuevas.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Amigos de `p_me` que pueden enseñarle algo: amistad viva, sin bloqueo y perfil encendido.
-- -------------------------------------------------------------------------------------
create function public.social_visible_friends(p_me uuid)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.friendships f
  join public.profiles p on p.id = case when f.a_id = p_me then f.b_id else f.a_id end
  where (f.a_id = p_me or f.b_id = p_me)
    and f.ended_at is null
    and p.public_visibility <> 'off'
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_me and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = p_me));
$$;

-- -------------------------------------------------------------------------------------
-- Títulos que alguien ha VISTO: los tres escalones de «visto» de sus listas (son excluyentes:
-- vista, me gustó, favorita) y, en películas, cualquier pase del diario. Interna: solo la usan
-- las funciones de abajo.
-- -------------------------------------------------------------------------------------
create function public.social_seen_titles(p_user uuid)
returns table (media_type public.media_type, tmdb_id integer, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select x.media_type, x.tmdb_id, max(x.at)
  from (
    select li.media_type, li.tmdb_id, li.added_at as at
    from public.library_items li
    where li.user_id = p_user
      and li.collection in ('MoviesVistas', 'LikedMovies', 'MovieFavs', 'SeriesVistas', 'LikedSeries', 'SeriesFavs')
    union all
    select wl.media_type, wl.tmdb_id, wl.watched_on::timestamptz
    from public.watch_log wl
    where wl.user_id = p_user and wl.media_type = 'movie'
  ) x
  group by x.media_type, x.tmdb_id;
$$;

-- -------------------------------------------------------------------------------------
-- «Amigos que la han visto» de UN título: una fila por amigo que tenga algo que ver con él.
--   state 'seen'     la vio (listas de visto o, en películas, el diario)
--         'watching' la está viendo (Viendo / Siguiendo, o episodios en el diario sin abandonarla)
--         'pending'  la tiene en Pendientes o Ver pronto
-- `score` es su nota, si la puso. Orden: vistas primero, mejor nota, lo más reciente.
-- -------------------------------------------------------------------------------------
create function public.social_friends_seen(p_me uuid, p_type public.media_type, p_id integer)
returns table (friend_id uuid, state text, score numeric, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with fr as (
    select id from public.social_visible_friends(p_me)
  ),
  lvl as (
    select li.user_id,
           case
             when li.collection in ('MoviesVistas', 'LikedMovies', 'MovieFavs', 'SeriesVistas', 'LikedSeries', 'SeriesFavs') then 3
             when li.collection in ('MoviesViendo', 'SeriesSiguiendo') then 2
             when li.collection in ('MoviesPendientes', 'MoviesVerPronto', 'SeriesPendiente', 'SeriesVerPronto') then 1
             else 0
           end as lvl,
           li.added_at as at
    from public.library_items li
    where li.user_id in (select id from fr) and li.media_type = p_type and li.tmdb_id = p_id
    union all
    select wl.user_id, case when p_type = 'movie' then 3 else 2 end, max(wl.watched_on)::timestamptz
    from public.watch_log wl
    where wl.user_id in (select id from fr) and wl.media_type = p_type and wl.tmdb_id = p_id
      -- Una serie abandonada con episodios en el diario no está «viéndose».
      and not exists (
        select 1 from public.library_items a
        where a.user_id = wl.user_id and a.collection = 'SeriesAbandonadas' and a.tmdb_id = p_id)
    group by wl.user_id
  ),
  st as (
    select user_id, max(lvl) as lvl, max(at) as at from lvl group by user_id
  )
  select st.user_id,
         case st.lvl when 3 then 'seen' when 2 then 'watching' else 'pending' end,
         r.score,
         st.at
  from st
  left join public.ratings r on r.user_id = st.user_id and r.media_type = p_type and r.tmdb_id = p_id
  where st.lvl > 0
    and not exists (
      select 1 from public.profile_hidden_titles h
      where h.user_id = st.user_id and h.media_type = p_type and h.tmdb_id = p_id)
  order by st.lvl desc, r.score desc nulls last, st.at desc;
$$;

-- -------------------------------------------------------------------------------------
-- «En común contigo»: lo que habéis visto los dos, con la nota de cada uno. Vacío si no sois
-- amigos (o hay bloqueo, o su perfil está apagado). Los recuentos y el orden los hace el servidor.
-- -------------------------------------------------------------------------------------
create function public.social_in_common(p_me uuid, p_them uuid)
returns table (media_type public.media_type, tmdb_id integer, my_score numeric, their_score numeric, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.media_type, a.tmdb_id, ra.score, rb.score, greatest(a.at, b.at)
  from public.social_seen_titles(p_me) a
  join public.social_seen_titles(p_them) b on b.media_type = a.media_type and b.tmdb_id = a.tmdb_id
  left join public.ratings ra on ra.user_id = p_me   and ra.media_type = a.media_type and ra.tmdb_id = a.tmdb_id
  left join public.ratings rb on rb.user_id = p_them and rb.media_type = a.media_type and rb.tmdb_id = a.tmdb_id
  where p_them in (select id from public.social_visible_friends(p_me))
    and not exists (
      select 1 from public.profile_hidden_titles h
      where h.user_id = p_them and h.media_type = a.media_type and h.tmdb_id = a.tmdb_id);
$$;

-- -------------------------------------------------------------------------------------
-- La ruleta con un amigo: lo que los dos tenéis en Pendientes (las mismas listas que usa la
-- ruleta de siempre). Vacío si no sois amigos.
-- -------------------------------------------------------------------------------------
create function public.social_pending_common(p_me uuid, p_them uuid)
returns table (media_type public.media_type, tmdb_id integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.media_type, a.tmdb_id
  from public.library_items a
  join public.library_items b on b.user_id = p_them and b.collection = a.collection and b.tmdb_id = a.tmdb_id
  where a.user_id = p_me
    and a.collection in ('MoviesPendientes', 'SeriesPendiente')
    and p_them in (select id from public.social_visible_friends(p_me))
    and not exists (
      select 1 from public.profile_hidden_titles h
      where h.user_id = p_them and h.media_type = a.media_type and h.tmdb_id = a.tmdb_id);
$$;

revoke all on function public.social_visible_friends(uuid)                         from public, anon, authenticated;
revoke all on function public.social_seen_titles(uuid)                             from public, anon, authenticated;
revoke all on function public.social_friends_seen(uuid, public.media_type, integer) from public, anon, authenticated;
revoke all on function public.social_in_common(uuid, uuid)                         from public, anon, authenticated;
revoke all on function public.social_pending_common(uuid, uuid)                    from public, anon, authenticated;
grant execute on function public.social_friends_seen(uuid, public.media_type, integer) to service_role;
grant execute on function public.social_in_common(uuid, uuid)                         to service_role;
grant execute on function public.social_pending_common(uuid, uuid)                    to service_role;

-- -------------------------------------------------------------------------------------
-- «En común contigo» deja de ser «Pronto» y nace ENCENDIDA: solo la ven tus amigos y cada uno ve
-- lo suyo contigo. Hasta ahora nadie podía encenderla (el interruptor estaba deshabilitado), así
-- que pasar el `false` guardado a `true` no pisa ninguna decisión de nadie.
-- -------------------------------------------------------------------------------------
alter table public.profiles alter column public_sections set default
  '[{"id":"favs","on":true},{"id":"log","on":true},{"id":"best","on":true},{"id":"collections","on":true},{"id":"common","on":true}]';

update public.profiles
set public_sections = (
  select jsonb_agg(case when e ->> 'id' = 'common' then jsonb_set(e, '{on}', 'true') else e end order by ord)
  from jsonb_array_elements(public_sections) with ordinality t(e, ord))
where public_sections @> '[{"id":"common","on":false}]';
