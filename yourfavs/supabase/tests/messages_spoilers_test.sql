-- Pruebas del escudo de spoilers (migración 20261030090000_messages_spoilers.sql, handoff M4 §2.2 y
-- §3.4). Lo importante: quien no ha llegado NO recibe el texto por ningún camino. Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','z']);
insert into auth.users (id, email, aud, role)
select id, 'sptest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('b'));
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('c'));

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Severance', array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'id')::bigint);
create function pg_temp.last(p_me text, p_conv bigint) returns jsonb language sql as $$
  select public.msg_history(pg_temp.u(p_me), p_conv) -> 'messages' -> -1 $$;

-- Severance (95396) T2 E5 · Perfect Days (976893).
create function pg_temp.sp(p_ep boolean) returns jsonb language sql as $$
  select case when p_ep then '{"mediaType":"tv","tmdbId":95396,"title":"Severance","season":2,"episode":5}'::jsonb
              else '{"mediaType":"movie","tmdbId":976893,"title":"Perfect Days"}'::jsonb end $$;

-- ================================================================ enviar
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'Mark sale por fin del ascensor', null, null, null, pg_temp.sp(true)) #>> '{message,spoiler,episode}', '5',
  'enviar marcado como spoiler de T2 E5');
insert into t_v values ('m1', (select max(id) from messages where conv_id = pg_temp.v('g')));
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'x', null, null, null, '{"mediaType":"tv","tmdbId":95396,"title":"S","season":2}') ->> 'error', 'spoiler',
  'temporada sin episodio → spoiler');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'x', null, null, null, '{"mediaType":"movie","tmdbId":1,"title":"P","season":1,"episode":1}') ->> 'error', 'spoiler',
  'película con episodio → spoiler');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'x', null, null, null, '{"mediaType":"tv","tmdbId":95396,"title":""}') ->> 'error', 'spoiler',
  'sin título → spoiler');
select ok((public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'Al final lo descubren todo', null, null, null, '{"mediaType":"tv","tmdbId":95396,"title":"Severance"}') -> 'message' -> 'spoiler') is not null,
  'serie entera, sin episodio: vale');
insert into t_v values ('m2', (select max(id) from messages where conv_id = pg_temp.v('g')));

-- ================================================================ quien no ha llegado
select is(pg_temp.last('b', pg_temp.v('g')) -> 'body', 'null'::jsonb, 'b (sin ver nada): el texto NO llega');
select is(pg_temp.last('b', pg_temp.v('g')) ->> 'locked', 'true', 'b: bloqueado');
select ok(jsonb_array_length(pg_temp.last('b', pg_temp.v('g')) -> 'lines') >= 1, 'b: con las barras sustitutas');
select is(pg_temp.last('b', pg_temp.v('g')) #>> '{spoiler,title}', 'Severance', 'b: el título sí se lee');
select is((select x -> 'body' from jsonb_array_elements(public.msg_list(pg_temp.u('b'))) c, lateral (select c -> 'last' as x) l
           where (c ->> 'id')::bigint = pg_temp.v('g')), 'null'::jsonb, 'la vista previa de la lista tampoco lleva el texto');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'Mark sale por fin del ascensor', null, null, null, pg_temp.sp(true)) #>> '{message,body}',
  'Mark sale por fin del ascensor', 'quien lo escribe lo ve siempre');
select is(pg_temp.last('a', pg_temp.v('g')) ->> 'locked', 'false', 'a (autora): no bloqueado');

-- ================================================================ llegar
-- b ve T2 E4: aún no.
insert into public.watch_log (user_id, media_type, tmdb_id, season, episode, watched_on) values (pg_temp.u('b'), 'tv', 95396, 2, 4, current_date);
select ok(not public.msg_spoiler_reached(pg_temp.u('b'), pg_temp.sp(true)), 'T2 E4 no llega a T2 E5');
-- b ve T3 E1 (se saltó episodios): cuenta como llegado.
insert into public.watch_log (user_id, media_type, tmdb_id, season, episode, watched_on) values (pg_temp.u('b'), 'tv', 95396, 3, 1, current_date);
select ok(public.msg_spoiler_reached(pg_temp.u('b'), pg_temp.sp(true)), 'T3 E1 sí (uno posterior cuenta)');
create function pg_temp.msg(p_me text, p_conv bigint, p_id bigint) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.msg_history(pg_temp.u(p_me), p_conv) -> 'messages') x where (x ->> 'id')::bigint = p_id $$;
select is(pg_temp.msg('b', pg_temp.v('g'), pg_temp.v('m1')) ->> 'body', 'Mark sale por fin del ascensor', 'b ya lo ha visto: el texto llega');
select is(pg_temp.msg('b', pg_temp.v('g'), pg_temp.v('m1')) ->> 'spoiler_seen', 'true', 'b: con la marca «Ya lo has visto»');
select is((select x ->> 'locked' from jsonb_array_elements(public.msg_history(pg_temp.u('b'), pg_temp.v('g')) -> 'messages') x
           where (x ->> 'id')::bigint = pg_temp.v('m2')), 'true', 'serie entera: con episodios sueltos aún no');
insert into public.library_items (user_id, collection, tmdb_id) values (pg_temp.u('b'), 'SeriesVistas', 95396);
select ok(public.msg_spoiler_reached(pg_temp.u('b'), '{"mediaType":"tv","tmdbId":95396,"title":"Severance"}'), 'serie entera: en Vistas, sí');
-- Película.
select ok(not public.msg_spoiler_reached(pg_temp.u('c'), pg_temp.sp(false)), 'película sin ver: no');
insert into public.watch_log (user_id, media_type, tmdb_id, watched_on) values (pg_temp.u('c'), 'movie', 976893, current_date);
select ok(public.msg_spoiler_reached(pg_temp.u('c'), pg_temp.sp(false)), 'película en el diario: sí');

-- ================================================================ «Mostrar igualmente»
select is(public.msg_spoiler_body(pg_temp.u('c'), pg_temp.v('m1')), 'Mark sale por fin del ascensor', 'c pide verlo: le llega el texto');
select is((select spoiler is not null from messages where id = pg_temp.v('m1')), true, 'y no se guarda nada (sigue marcado)');
select is(pg_temp.last('c', pg_temp.v('g')) ->> 'locked', 'true', 'al volver a pintar, c lo sigue viendo oculto');
select is(public.msg_spoiler_body(pg_temp.u('z'), pg_temp.v('m1')), null, 'quien no está en el grupo: nada');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('g'), 'normal', null) #>> '{message,spoiler}', null, 'un mensaje normal no lleva spoiler');
select is(public.msg_spoiler_body(pg_temp.u('c'), (select max(id) from messages where conv_id = pg_temp.v('g'))), null, 'de un mensaje sin spoiler: nada');

-- ================================================================ tarjeta con spoiler
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'El final me rompió', null, 'title',
  '{"mediaType":"movie","tmdbId":976893,"title":"Perfect Days"}', pg_temp.sp(false)) ->> 'ok', 'true', 'tarjeta con comentario marcado');
select is(pg_temp.last('b', pg_temp.v('ab')) -> 'body', 'null'::jsonb, 'b no la ha visto: el comentario no llega');
select is(pg_temp.last('b', pg_temp.v('ab')) #>> '{card,ref,title}', 'Perfect Days', 'pero la tarjeta (póster, título) sí');

-- Borrado: sin spoiler ni barras.
select is(public.msg_delete(pg_temp.u('a'), pg_temp.v('m2')), 'ok', 'borrar un spoiler');
select ok((select x -> 'spoiler' = 'null'::jsonb and x ->> 'locked' = 'false' from jsonb_array_elements(public.msg_history(pg_temp.u('c'), pg_temp.v('g')) -> 'messages') x
           where (x ->> 'id')::bigint = pg_temp.v('m2')), 'borrado: ni spoiler ni bloqueo');

select ok(not has_function_privilege('authenticated', 'public.msg_spoiler_body(uuid, bigint)', 'execute'), 'permisos: solo el servidor');

select * from finish();
rollback;
