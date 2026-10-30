-- =====================================================================================
-- YourFavs · TMDB D3 (2026-10-30): importar la biblioteca desde IMDb, Letterboxd o TMDB.
--
--   · import_jobs          → una fila por importación: de dónde, qué fichero (huella), totales.
--   · import_job_changes   → lo que hizo EXACTAMENTE cada importación, para poder deshacerla sin
--                            tocar lo que ya tenías: filas añadidas, filas quitadas (con la fila
--                            entera para restaurarla) y notas puestas.
--   · import_apply / import_undo → escriben un lote en una transacción y apuntan cada cambio.
--
-- Una importación no es «haber visto algo hoy»: no avisa a nadie. Mientras corren estas funciones
-- se marca la transacción (`yourfavs.import`) y el trigger de «Ana ha visto Dune, que le
-- recomendaste» la deja pasar sin avisar. La actividad de amigos sale de `watch_log`, que la
-- importación de IMDb no toca.
--
-- `security invoker`, como las de posiciones: corren con la sesión de quien llama, así que la RLS
-- sigue limitando todo a TUS filas.
-- =====================================================================================

create table public.import_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source     text not null check (source in ('imdb', 'letterboxd', 'tmdb')),
  label      text not null default '',     -- nombre del fichero o «Cuenta de TMDB»
  file_hash  text,                         -- sha-256 del fichero: avisar si se importa dos veces
  totals     jsonb not null default '{}',  -- filas, encontradas, no encontradas… y lo aplicado
  created_at timestamptz not null default now(),
  undone_at  timestamptz
);

create index import_jobs_by_user on public.import_jobs (user_id, created_at desc);

create table public.import_job_changes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id     uuid not null references public.import_jobs (id) on delete cascade,
  kind       text not null check (kind in ('added', 'removed', 'rated')),
  collection text,                         -- added / removed
  media_type public.media_type not null,
  tmdb_id    integer not null,
  prev       jsonb                         -- removed: la fila quitada · rated: { score }
);

create index import_job_changes_by_job on public.import_job_changes (job_id);

alter table public.import_jobs enable row level security;
alter table public.import_job_changes enable row level security;

create policy "import_jobs: solo tus filas" on public.import_jobs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "import_job_changes: solo tus filas" on public.import_job_changes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------------------
-- Aplicar un lote ya decidido en el servidor (`services/BD/import/importLibrary.ts`, que aplica
-- las reglas de `stateTransitions.ts`). Aquí solo se ejecuta y se apunta:
--   p_ops = { "add":    [{ collection, tmdb_id, added_at, rating }],
--             "remove": [{ collection, tmdb_id }],
--             "rate":   [{ media_type, tmdb_id, score, at }] }
-- Todo con `on conflict do nothing`: si algo cambió entre la decisión y la escritura, gana lo que
-- ya había. Devuelve lo que de verdad se hizo.
-- -------------------------------------------------------------------------------------
create function public.import_apply(p_job uuid, p_ops jsonb)
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
    returning 1
  )
  select count(*) into v_added from logged;

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

  update public.import_jobs
     set totals = totals || jsonb_build_object(
           'added',   coalesce((totals->>'added')::integer, 0) + v_added,
           'removed', coalesce((totals->>'removed')::integer, 0) + v_removed,
           'rated',   coalesce((totals->>'rated')::integer, 0) + v_rated)
   where id = p_job;

  return jsonb_build_object('added', v_added, 'removed', v_removed, 'rated', v_rated);
end;
$$;

-- -------------------------------------------------------------------------------------
-- Deshacer una importación entera. Solo se toca lo que ella hizo y sigue como lo dejó:
--   · lo añadido se quita, salvo «Vistas» de un título que desde entonces has puesto en
--     Favoritos o Me gusta (ahí Vistas es el paraguas de tu opinión, no de la importación);
--   · lo quitado vuelve, si el título ya no está en ninguna lista de «visto»;
--   · la nota se borra solo si sigue siendo la importada (si la cambiaste, es tuya).
-- -------------------------------------------------------------------------------------
create function public.import_undo(p_job uuid)
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
begin
  if not exists (select 1 from public.import_jobs where id = p_job and user_id = v_me and undone_at is null) then
    raise exception 'import_undo: importación no encontrada';
  end if;
  perform set_config('yourfavs.import', 'on', true);

  with gone as (
    delete from public.library_items li
     using public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'added'
       and li.user_id = v_me and li.collection = c.collection and li.tmdb_id = c.tmdb_id
       and not (li.collection in ('MoviesVistas', 'SeriesVistas') and exists (
             select 1 from public.library_items o
              where o.user_id = v_me and o.tmdb_id = li.tmdb_id and o.media_type = li.media_type
                and o.collection in ('MovieFavs', 'LikedMovies', 'SeriesFavs', 'LikedSeries')))
    returning 1
  )
  select count(*) into v_removed from gone;

  with back as (
    insert into public.library_items (user_id, collection, tmdb_id, added_at, opinion, rating, position)
    select v_me, c.collection, c.tmdb_id, (c.prev->>'added_at')::timestamptz, c.prev->>'opinion',
           (c.prev->>'rating')::numeric, (c.prev->>'position')::integer
      from public.import_job_changes c
     where c.job_id = p_job and c.user_id = v_me and c.kind = 'removed'
       and not exists (
             select 1 from public.library_items o
              where o.user_id = v_me and o.tmdb_id = c.tmdb_id and o.media_type = c.media_type
                and o.collection in ('MoviesVistas', 'MovieFavs', 'LikedMovies', 'SeriesVistas', 'SeriesFavs', 'LikedSeries'))
    on conflict (user_id, collection, tmdb_id) do nothing
    returning 1
  )
  select count(*) into v_restored from back;

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

  update public.import_jobs set undone_at = now() where id = p_job;

  return jsonb_build_object('removed', v_removed, 'restored', v_restored, 'unrated', v_unrated);
end;
$$;

revoke all on function public.import_apply(uuid, jsonb) from public, anon;
revoke all on function public.import_undo(uuid)         from public, anon;
grant execute on function public.import_apply(uuid, jsonb) to authenticated;
grant execute on function public.import_undo(uuid)         to authenticated;

-- -------------------------------------------------------------------------------------
-- El trigger de recomendaciones vistas (F6 social), igual que antes salvo la primera línea: lo que
-- entra por una importación no avisa a quien te lo recomendó.
-- -------------------------------------------------------------------------------------
create or replace function public.social_rec_watched_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('yourfavs.import', true), '') = 'on' then
    return null;
  end if;
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

revoke all on function public.social_rec_watched_trg() from public, anon, authenticated;
