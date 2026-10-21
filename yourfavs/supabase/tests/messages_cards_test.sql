-- Pruebas de las tarjetas de título (migración 20261028090000_messages_cards.sql, handoff M4 §2).
-- Sobre todo la privacidad de las caras: solo amigos, solo de la conversación, con el filtro de
-- «Amigos que la han visto». Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- a es amiga de b, c, d y e. f no es amiga de a (pero sí de b). Todos con el perfil encendido
-- salvo d (apagado). a bloquea a e.
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','d','e','f','z']);
insert into auth.users (id, email, aud, role)
select id, 'cardtest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
update public.profiles set public_visibility = 'public' where id in (select id from t_users where n <> 'd');
select public.social_make_friends(pg_temp.u('a'), id) from t_users where n in ('b','c','d','e');
select public.social_make_friends(pg_temp.u('b'), pg_temp.u('f'));

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);
-- Grupo de a con b, c, d y e; b (admin también) añade a f, que es amiga suya y no de a.
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Cine', array[pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('d'), pg_temp.u('e')]) ->> 'id')::bigint);
select is(public.msg_make_admin(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('b')), 'ok', 'preparación: b también administra');
select is(public.msg_add_members(pg_temp.u('b'), pg_temp.v('g'), array[pg_temp.u('f')]) ->> 'ok', 'true', 'preparación: f entra en el grupo');
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('a'), pg_temp.u('e'));

-- ================================================================ enviar
create function pg_temp.card(p_type text, p_id int, p_title text) returns jsonb language sql as $$
  select jsonb_build_object('mediaType', p_type, 'tmdbId', p_id, 'title', p_title, 'poster', '/p.jpg', 'year', '2023', 'runtime', 124, 'junk', 'x') $$;

select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), '', null, 'title', pg_temp.card('movie', 976893, 'Perfect Days')) ->> 'ok', 'true',
  'send: solo tarjeta, sin texto');
select is((select card_ref from messages where conv_id = pg_temp.v('ab') order by id desc limit 1),
  '{"mediaType":"movie","tmdbId":976893,"title":"Perfect Days","poster":"/p.jpg","year":"2023","runtime":124}'::jsonb,
  'send: card_ref solo con las claves conocidas');
select is((select body from messages where conv_id = pg_temp.v('ab') order by id desc limit 1), '', 'send: sin comentario → body vacío');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), '  tienes que verla  ', null, 'title', pg_temp.card('tv', 95396, 'Severance')) #>> '{message,body}',
  'tienes que verla', 'send: tarjeta con comentario recortado');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', null, 'title', pg_temp.card('person', 1, 'X')) ->> 'error', 'card',
  'send: tipo de título que no es película ni serie → card');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', null, 'title', '{"mediaType":"movie","tmdbId":"abc","title":"X"}') ->> 'error', 'card',
  'send: id raro → card');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', null, 'rec', pg_temp.card('movie', 1, 'X')) ->> 'error', 'card',
  'send: las de recomendación no entran por aquí');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), '', null) ->> 'error', 'empty', 'send: sin tarjeta y sin texto → empty (como siempre)');
select is(public.msg_send(pg_temp.u('z'), pg_temp.v('ab'), '', null, 'title', pg_temp.card('movie', 1, 'X')) ->> 'error', 'none',
  'send: quien no es miembro → none');
select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', null) #>> '{message,card}', null, 'send: un texto normal no lleva tarjeta');

-- ================================================================ vista
insert into t_v values ('m1', (select id from messages where conv_id = pg_temp.v('ab') and card_type = 'title' order by id limit 1));
select is((public.msg_history(pg_temp.u('b'), pg_temp.v('ab')) -> 'messages' -> 0 -> 'card' ->> 'type'), 'title',
  'historial: la tarjeta llega a la otra persona');
select is(public.msg_delete(pg_temp.u('a'), pg_temp.v('m1')), 'ok', 'borrar una tarjeta: como cualquier mensaje');
select is((public.msg_history(pg_temp.u('b'), pg_temp.v('ab')) -> 'messages' -> 0 -> 'card'), 'null'::jsonb,
  'historial: borrada, sin tarjeta');
select is(public.msg_restore(pg_temp.u('a'), pg_temp.v('m1'), ''), 'ok', 'deshacer el borrado de una tarjeta sin comentario');
select is((public.msg_history(pg_temp.u('b'), pg_temp.v('ab')) -> 'messages' -> 0 -> 'card' ->> 'type'), 'title',
  'historial: restaurada, vuelve la tarjeta');

-- ================================================================ estados
-- a: Perfect Days vista con 8,5; Severance viendo (hasta T2 E3, con un especial T0 E1); Dune pendiente.
insert into public.library_items (user_id, collection, tmdb_id) values
  (pg_temp.u('a'), 'MoviesVistas', 976893), (pg_temp.u('a'), 'SeriesSiguiendo', 95396), (pg_temp.u('a'), 'MoviesPendientes', 693134);
insert into public.ratings (user_id, media_type, tmdb_id, score) values (pg_temp.u('a'), 'movie', 976893, 8.5);
insert into public.watch_log (user_id, media_type, tmdb_id, season, episode, watched_on) values
  (pg_temp.u('a'), 'tv', 95396, 1, 9, current_date), (pg_temp.u('a'), 'tv', 95396, 2, 3, current_date),
  (pg_temp.u('a'), 'tv', 95396, 2, 1, current_date), (pg_temp.u('a'), 'tv', 95396, 0, 1, current_date);
-- Amigos (b, c, d, e) y f, todos la han visto con nota.
insert into public.library_items (user_id, collection, tmdb_id) select id, 'MoviesVistas', 976893 from t_users where n in ('b','c','d','e','f');
insert into public.ratings (user_id, media_type, tmdb_id, score) select id, 'movie', 976893, 9 from t_users where n in ('b','c','d','e','f');
-- c la ocultó de su perfil.
insert into public.profile_hidden_titles (user_id, media_type, tmdb_id) values (pg_temp.u('c'), 'movie', 976893);
-- b tiene Dune pendiente.
insert into public.library_items (user_id, collection, tmdb_id) values (pg_temp.u('b'), 'MoviesPendientes', 693134);

create temp table t_s as
  select s.*, (select n from t_users where id = s.user_id) as who
  from public.msg_card_states(pg_temp.u('a'), pg_temp.v('g'),
    '[{"t":"movie","id":976893},{"t":"tv","id":95396},{"t":"movie","id":693134},{"t":"movie","id":1}]') s;

select is((select state || ':' || score from t_s where who = 'a' and tmdb_id = 976893), 'seen:8.5', 'yo: vista con mi nota');
select is((select state || ':' || season || ':' || episode from t_s where who = 'a' and tmdb_id = 95396), 'watching:2:3',
  'yo: viendo, último episodio visto T2 E3 (sin contar especiales)');
select is((select state from t_s where who = 'a' and tmdb_id = 693134), 'pending', 'yo: pendiente');
select is((select count(*)::int from t_s where tmdb_id = 1), 0, 'nada que ver con un título → sin filas');
select is((select string_agg(who, ',' order by who) from t_s where tmdb_id = 976893 and who <> 'a'), 'b',
  'caras: solo b (c la ocultó, d tiene el perfil apagado, e está bloqueada, f no es amiga)');
select is((select state || ':' || score from t_s where who = 'b' and tmdb_id = 976893), 'seen:9.0', 'caras: estado y nota de b');
select is((select state from t_s where who = 'b' and tmdb_id = 693134), 'pending', 'caras: el pendiente de un amigo sale por nombre');

-- En el 1:1 con b: b sale; en el grupo, b ve a a (amiga) y a f (amiga suya), no a c/d/e.
select is((select count(*)::int from public.msg_card_states(pg_temp.u('a'), pg_temp.v('ab'), '[{"t":"movie","id":976893}]') s where s.user_id = pg_temp.u('b')), 1,
  '1:1: la otra persona sale si es amiga');
select is((select string_agg(t.n, ',' order by t.n)
           from public.msg_card_states(pg_temp.u('b'), pg_temp.v('g'), '[{"t":"movie","id":976893}]') s
           join t_users t on t.id = s.user_id where s.user_id <> pg_temp.u('b')), 'a,f',
  'grupo visto por b: sus amigos del grupo (a y f), no la gente que no es amiga suya');

-- Quien sale del grupo deja de salir en las caras.
select is(public.msg_leave(pg_temp.u('f'), pg_temp.v('g')), 'ok', 'f sale del grupo');
select is((select count(*)::int from public.msg_card_states(pg_temp.u('b'), pg_temp.v('g'), '[{"t":"movie","id":976893}]') s where s.user_id = pg_temp.u('f')), 0,
  'grupo: quien salió ya no sale');
select is((select count(*)::int from public.msg_card_states(pg_temp.u('z'), pg_temp.v('g'), '[{"t":"movie","id":976893}]')), 0,
  'quien no está en la conversación no recibe nada');
select is((select count(*)::int from public.msg_card_states(pg_temp.u('a'), pg_temp.v('g'), '{"t":"movie"}')), 0,
  'refs que no son una lista → nada (sin error)');

select ok(not has_function_privilege('authenticated', 'public.msg_card_states(uuid, bigint, jsonb)', 'execute'), 'permisos: solo el servidor');
select ok(not has_function_privilege('anon', 'public.msg_send(uuid, bigint, text, uuid, text, jsonb)', 'execute'), 'permisos: enviar, solo el servidor');

select * from finish();
rollback;
