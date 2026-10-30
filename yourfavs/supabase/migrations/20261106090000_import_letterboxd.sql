-- =====================================================================================
-- YourFavs · TMDB D3b (2026-10-30): importar desde Letterboxd. Amplía la importación de D3a
-- (`20261105090000_import_jobs`) con dos cosas que IMDb no trae:
--
--   · el DIARIO: un pase en `watch_log` por cada visionado con su fecha real (`source = 'import'`,
--     `logged_at` = mediodía UTC de ese día, como el backfill: no sabemos la hora);
--   · las LISTAS: cada lista de Letterboxd entra en una colección propia (`custom_list_items`).
--
-- Y el registro de deshacer apunta también esos dos tipos de cambio ('logged', 'listed') y las
-- colecciones que creó la importación ('list'). Deshacer las quita, salvo que la colección tenga
-- títulos que añadiste tú después.
--
-- Además, «deshacer» devuelve lo quitado con una regla más fina, necesaria ahora que se importan
-- Me gusta y Favoritos: lo quitado vuelve salvo que choque con lo que hay ahora (Pendientes no
-- vuelve si el título está visto; Me gusta no vuelve si está en Favoritos, ni al revés).
-- =====================================================================================

alter table public.import_job_changes drop constraint import_job_changes_kind_check;
alter table public.import_job_changes add constraint import_job_changes_kind_check
  check (kind in ('added', 'removed', 'rated', 'logged', 'list', 'listed'));

-- -------------------------------------------------------------------------------------
-- p_ops, como en D3a, más:
--   "log":    [{ media_type, tmdb_id, watched_on, rewatch }]
--   "listed": [{ list_id, media_type, tmdb_id, title, poster_path, position }]
-- -------------------------------------------------------------------------------------
create or replace function public.import_apply(p_job uuid, p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_added integer := 0;
  v_removed integer := 0;
  v_rated integer := 0;
  v_logged integer := 0;
  v_listed integer := 0;
begin
  if not exists (select 1 from public.import_jobs where id = p_job and user_id = v_me and undone_at is null) then
    raise exception 'import_apply: importación no encontrada';
  end if;
  perform set_config('yourfavs.import', 'on', true);

  -- Quitar (p. ej. de Pendientes al marcar Vista), guardando la fila entera para deshacer.
  with gone as (
    delete from public.library_items li
     using jsonb_to_recordset(coalesce(p_ops->'remove', '[]')) as r(collection text, tmdb_id integer)
     where li.user_id = v_me and li.collection = r.collection and li.tmdb_id = r.tmdb_id
    returning li.collection, li.tmdb_id, li.media_type, li.added_at, li.opinion, li.rating, li.position
  ), logged as (
    insert into public.import_job_changes (user_id, job_id, kind, collection, media_type, tmdb_id, prev)
    select v_me, p_job, 'removed', g.collection, g.media_type, g.tmdb_id,
           jsonb_build_object('added_at', g.added_at, 'opinion', g.opinion, 'rating', g.rating, 'position', g.position)
      from gone g
    returning 1
  )
  select count(*) into v_removed from logged;

  -- Añadir. `media_type` es columna generada (sale de la colección).
  with ins as (
    insert into public.library_items (user_id, collection, tmdb_id, added_at, rating)
    select v_me, a.collection, a.tmdb_id, coalesce(a.added_at, now()), a.rating
      from jsonb_to_recordset(coalesce(p_ops->'add', '[]')) as a(collection text, tmdb_id integer, added_at timestamptz, rating numeric)
    on conflict (user_id, collection, tmdb_id) do nothing
    returning collection, tmdb_id, media_type
  ), logged as (
    insert into public.import_job_changes (user_id, job_id, kind, collection, media_type, tmdb_id)
    select v_me, p_job, 'added', i.collection, i.media_type, i.tmdb_id from ins i
    returning media_type, tmdb_id
  )
  -- Títulos, no filas: Favoritos + Vistas de la misma película cuenta una.
  select count(distinct (media_type, tmdb_id)) into v_added from logged;

  -- Notas: solo donde no había ninguna (la tuya manda).
  with ins as (
    insert into public.ratings (user_id, media_type, tmdb_id, score, created_at, updated_at)
    select v_me, r.media_type, r.tmdb_id, r.score, coalesce(r.at, now()), coalesce(r.at, now())
      from jsonb_to_recordset(coalesce(p_ops->'rate', '[]')) as r(media_type public.media_type, tmdb_id integer, score numeric, at timestamptz)
    on conflict (user_id, media_type, tmdb_id) do nothing
    returning media_type, tmdb_id, score
  ), copied as (
    -- La nota también vive copiada en cada lista del título (como al ponerla a mano).
    update public.library_items li set rating = i.score
      from ins i
     where li.user_id = v_me and li.media_type = i.media_type and li.tmdb_id = i.tmdb_id and li.rating is null
    returning 1
  ), logged as (
    insert into public.import_job_changes (user_id, job_id, kind, media_type, tmdb_id, prev)
    select v_me, p_job, 'rated', i.media_type, i.tmdb_id, jsonb_build_object('score', i.score) from ins i
    returning 1
  )
  select count(*) into v_rated from logged;

  -- Diario: un pase por visionado con su día real. Si ya hay un pase de ese título ese día (lo
  -- apuntaste a mano o ya se importó), no se repite.
  with src as (
    select distinct on (l.media_type, l.tmdb_id, l.watched_on) l.*
      from jsonb_to_recordset(coalesce(p_ops->'log', '[]')) as l(media_type public.media_type, tmdb_id integer, watched_on date, rewatch boolean)
  ), ins as (
    insert into public.watch_log (user_id, media_type, tmdb_id, watched_on, rewatch, logged_at, source)
    select v_me, s.media_type, s.tmdb_id, s.watched_on, coalesce(s.rewatch, false),
           (s.watched_on + time '12:00') at time zone 'UTC', 'import'
      from src s
     where not exists (
             select 1 from public.watch_log w
              where w.user_id = v_me and w.media_type = s.media_type and w.tmdb_id = s.tmdb_id
                and w.watched_on = s.watched_on and w.season is null)
    returning id, media_type, tmdb_id
  ), logged as (
    insert into public.import_job_changes (user_id, job_id, kind, media_type, tmdb_id, prev)
    select v_me, p_job, 'logged', i.media_type, i.tmdb_id, jsonb_build_object('id', i.id) from ins i
    returning 1
  )
  select count(*) into v_logged from logged;

  -- Colecciones propias (la colección la crea el servidor antes y la apunta como 'list').
  with ins as (
    insert into public.custom_list_items (user_id, list_id, media_type, tmdb_id, title, poster_path, position)
    select v_me, l.list_id, l.media_type, l.tmdb_id, coalesce(l.title, ''), l.poster_path, l.position
      from jsonb_to_recordset(coalesce(p_ops->'listed', '[]'))
           as l(list_id text, media_type public.media_type, tmdb_id integer, title text, poster_path text, position integer)
    on conflict (user_id, list_id, media_type, tmdb_id) do nothing
    returning list_id, media_type, tmdb_id
  ), logged as (
    insert into public.import_job_changes (user_id, job_id, kind, media_type, tmdb_id, prev)
    select v_me, p_job, 'listed', i.media_type, i.tmdb_id, jsonb_build_object('list_id', i.list_id) from ins i
    returning 1
  )
  select count(*) into v_listed from logged;

  update public.import_jobs
     set totals = totals || jsonb_build_object(
           'added',   coalesce((totals->>'added')::integer, 0) + v_added,
           'removed', coalesce((totals->>'removed')::integer, 0) + v_removed,
           'rated',   coalesce((totals->>'rated')::integer, 0) + v_rated,
           'logged',  coalesce((totals->>'logged')::integer, 0) + v_logged,
           'listed',  coalesce((totals->>'listed')::integer, 0) + v_listed)
   where id = p_job;

  return jsonb_build_object('added', v_added, 'removed', v_removed, 'rated', v_rated, 'logged', v_logged, 'listed', v_listed);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Deshacer, ahora también diario y colecciones. Solo lo que hizo la importación y sigue como lo
-- dejó (ver la cabecera de `20261105090000_import_jobs`).
-- -------------------------------------------------------------------------------------
create or replace function public.import_undo(p_job uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_removed integer := 0;
  v_restored integer := 0;
  v_unrated integer := 0;
  v_unlogged integer := 0;
  v_unlisted integer := 0;
begin
  if not exists (select 1 from public.import_jobs where id = p_job and user_id = v_me and undone_at is null) then
    raise exception 'import_undo: importación no encontrada';
  end if;
  perform set_config('yourfavs.import', 'on', true);

  -- Lo añadido se quita, salvo Vistas de un título que hoy está en Favoritos o Me gusta (ahí Vistas
  -- es el paraguas de tu opinión, no de la importación).
  with gone as (
    delete from public.library_items li
     using public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'added'
       and li.user_id = v_me and li.collection = c.collection and li.tmdb_id = c.tmdb_id
       and not (li.collection in ('MoviesVistas', 'SeriesVistas') and exists (
             select 1 from public.library_items o
              where o.user_id = v_me and o.tmdb_id = li.tmdb_id and o.media_type = li.media_type
                and o.collection in ('MovieFavs', 'LikedMovies', 'SeriesFavs', 'LikedSeries')
                and not exists (
                      select 1 from public.import_job_changes c2
                       where c2.job_id = p_job and c2.kind = 'added' and c2.collection = o.collection and c2.tmdb_id = o.tmdb_id)))
    returning li.media_type, li.tmdb_id
  )
  select count(distinct (media_type, tmdb_id)) into v_removed from gone;

  -- Lo quitado vuelve si no choca con lo que hay ahora.
  with back as (
    insert into public.library_items (user_id, collection, tmdb_id, added_at, opinion, rating, position)
    select v_me, c.collection, c.tmdb_id, (c.prev->>'added_at')::timestamptz, c.prev->>'opinion',
           (c.prev->>'rating')::numeric, (c.prev->>'position')::integer
      from public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'removed'
       and not exists (
             select 1 from public.library_items o
              where o.user_id = v_me and o.tmdb_id = c.tmdb_id and o.media_type = c.media_type
                and o.collection = any (case
                      when c.collection = 'LikedMovies' then array['MovieFavs']
                      when c.collection = 'MovieFavs'   then array['LikedMovies']
                      when c.collection = 'LikedSeries' then array['SeriesFavs']
                      when c.collection = 'SeriesFavs'  then array['LikedSeries']
                      else array['MoviesVistas', 'MovieFavs', 'LikedMovies', 'SeriesVistas', 'SeriesFavs', 'LikedSeries']
                    end))
    on conflict (user_id, collection, tmdb_id) do nothing
    returning 1
  )
  select count(*) into v_restored from back;

  -- La nota, solo si sigue siendo la importada.
  with gone as (
    delete from public.ratings r
     using public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'rated'
       and r.user_id = v_me and r.media_type = c.media_type and r.tmdb_id = c.tmdb_id
       and r.score = (c.prev->>'score')::numeric
    returning r.media_type, r.tmdb_id, r.score
  ), cleared as (
    update public.library_items li set rating = null
      from gone g
     where li.user_id = v_me and li.media_type = g.media_type and li.tmdb_id = g.tmdb_id and li.rating = g.score
    returning 1
  )
  select count(*) into v_unrated from gone;

  -- Los pases del diario que creó (por id: los tuyos de ese mismo día no se tocan).
  with gone as (
    delete from public.watch_log w
     using public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'logged'
       and w.user_id = v_me and w.id = (c.prev->>'id')::uuid
    returning 1
  )
  select count(*) into v_unlogged from gone;

  -- Los títulos que metió en colecciones…
  with gone as (
    delete from public.custom_list_items i
     using public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'listed'
       and i.user_id = v_me and i.list_id = c.prev->>'list_id' and i.media_type = c.media_type and i.tmdb_id = c.tmdb_id
    returning 1
  )
  select count(*) into v_unlisted from gone;

  -- …y las colecciones que creó, si se han quedado vacías (si añadiste algo después, es tuya).
  delete from public.custom_lists l
   using public.import_job_changes c
   where c.job_id = p_job and c.user_id = v_me and c.kind = 'list'
     and l.user_id = v_me and l.id = c.prev->>'list_id'
     and not exists (select 1 from public.custom_list_items i where i.user_id = v_me and i.list_id = l.id);

  update public.import_jobs set undone_at = now() where id = p_job;

  return jsonb_build_object('removed', v_removed, 'restored', v_restored, 'unrated', v_unrated,
                            'unlogged', v_unlogged, 'unlisted', v_unlisted);
end;
$$;
