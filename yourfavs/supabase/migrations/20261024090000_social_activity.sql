-- =====================================================================================
-- YourFavs · Portada social y cierre del bucle (F6 de la capa social, docs/PLAN_SOCIAL.md).
--
--   · «Lo que ven tus amigos» en la portada → social_recent_activity
--   · «Ana ha visto Dune, que le recomendaste» → social_rec_mark_watched + triggers
--
-- Seguridad: como F2–F5, funciones `security definer` solo para el servidor (service_role). Los
-- triggers corren con el dueño de la función: escriben en el buzón de OTRA persona sin abrir nada
-- a `authenticated`.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Actividad reciente de la gente que te importa: tus amigos y las personas que sigues. Solo lo que
-- su perfil ya enseña a quien mira:
--   · amigos con el perfil encendido (público o «solo amigos»),
--   · seguidos que no son amigos, solo si su perfil es público,
--   · nunca si hay un bloqueo, si apagaron «Lo último visto» o si el título está oculto.
-- Una fila por persona y título (los episodios de una serie se cuentan, sin decir cuáles). La nota
-- solo en películas, como en «Lo último visto» del perfil. Como mucho 80 filas.
-- -------------------------------------------------------------------------------------
create function public.social_recent_activity(p_me uuid, p_days integer)
returns table (person_id uuid, media_type public.media_type, tmdb_id integer, season smallint, episodes integer, watched_on date, score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select id from public.social_visible_friends(p_me)
    union
    select fo.followee_id
    from public.follows fo
    join public.profiles p on p.id = fo.followee_id
    where fo.follower_id = p_me
      and p.public_visibility = 'public'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_me and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = p_me))
  ),
  shown as (
    select pe.id
    from people pe
    join public.profiles p on p.id = pe.id
    where not (p.public_sections @> '[{"id":"log","on":false}]')
  )
  select wl.user_id,
         wl.media_type,
         wl.tmdb_id,
         max(wl.season),
         (count(distinct (wl.season, wl.episode)) filter (where wl.episode is not null))::integer,
         max(wl.watched_on),
         max(r.score)
  from public.watch_log wl
  left join public.ratings r
    on r.user_id = wl.user_id and r.media_type = wl.media_type and r.tmdb_id = wl.tmdb_id and wl.media_type = 'movie'
  where wl.user_id in (select id from shown)
    and wl.watched_on >= current_date - least(greatest(coalesce(p_days, 7), 1), 30)
    and not exists (
      select 1 from public.profile_hidden_titles h
      where h.user_id = wl.user_id and h.media_type = wl.media_type and h.tmdb_id = wl.tmdb_id)
  group by wl.user_id, wl.media_type, wl.tmdb_id
  order by max(wl.watched_on) desc, max(wl.logged_at) desc
  limit 80;
$$;

-- -------------------------------------------------------------------------------------
-- Cierre del bucle: cuándo vio quien la recibió lo que le recomendaron (una vez por destinatario).
-- -------------------------------------------------------------------------------------
alter table public.recommendation_recipients add column watched_at timestamptz;

-- `p_me` ha visto (o valorado) ese título: marca sus recomendaciones de él y avisa a quien se las
-- envió, si siguen siendo amigos y sin bloqueo. Las descartadas no: descartar es silencioso, y
-- avisar después contaría que la vio igual. El aviso no lleva la nota: se lee al pintarlo.
create function public.social_rec_mark_watched(p_me uuid, p_type text, p_id integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select rr.rec_id, rec.from_id
    from public.recommendation_recipients rr
    join public.recommendations rec on rec.id = rr.rec_id
    where rr.to_id = p_me and rec.target_type = p_type and rec.target_id = p_id
      and rr.watched_at is null and rr.status <> 'discarded'
  loop
    update public.recommendation_recipients set watched_at = now() where rec_id = r.rec_id and to_id = p_me;
    if public.social_are_friends(p_me, r.from_id) and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_me and b.blocked_id = r.from_id) or (b.blocker_id = r.from_id and b.blocked_id = p_me)) then
      perform public.social_notify(r.from_id, 'recseen:' || r.rec_id || ':' || p_me, 'rec_watched', p_me);
    end if;
  end loop;
end;
$$;

-- Un único trigger para los tres caminos por los que alguien «ve» algo: entrar en una lista de
-- visto, un pase de película en el diario o ponerle nota. Así no depende de qué pantalla lo hizo.
create function public.social_rec_watched_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `if` anidados: PL/pgSQL no corta el `and`, y `new.collection` no existe en las otras tablas.
  if tg_table_name = 'library_items' then
    if new.collection not in ('MoviesVistas', 'LikedMovies', 'MovieFavs', 'SeriesVistas', 'LikedSeries', 'SeriesFavs') then
      return null;
    end if;
  elsif tg_table_name = 'watch_log' then
    if new.media_type <> 'movie' then
      return null;
    end if;
  end if;
  -- Lo normal es que no haya ninguna recomendación de ese título: una consulta por índice y fuera.
  if not exists (
    select 1 from public.recommendation_recipients rr
    join public.recommendations rec on rec.id = rr.rec_id
    where rr.to_id = new.user_id and rec.target_type = new.media_type::text and rec.target_id = new.tmdb_id
      and rr.watched_at is null) then
    return null;
  end if;
  perform public.social_rec_mark_watched(new.user_id, new.media_type::text, new.tmdb_id);
  return null;
exception when others then
  -- Un aviso nunca puede tumbar el guardado de quien acaba de ver la película.
  raise warning 'social_rec_watched_trg: %', sqlerrm;
  return null;
end;
$$;

create trigger social_rec_watched after insert on public.library_items
  for each row execute function public.social_rec_watched_trg();
create trigger social_rec_watched after insert on public.watch_log
  for each row execute function public.social_rec_watched_trg();
create trigger social_rec_watched after insert or update of score on public.ratings
  for each row execute function public.social_rec_watched_trg();

revoke all on function public.social_recent_activity(uuid, integer)        from public, anon, authenticated;
revoke all on function public.social_rec_mark_watched(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.social_rec_watched_trg()                     from public, anon, authenticated;
grant execute on function public.social_recent_activity(uuid, integer) to service_role;
