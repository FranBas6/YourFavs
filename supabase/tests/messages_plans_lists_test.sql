-- Pruebas de los planes fuera del chat (migración 20261102090000_messages_plans_lists.sql,
-- handoff M5 §3.4–§3.6): `plan_mine` (Ver pronto y calendario) y `plan_today_sync` (campana).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- a es amiga de b y c. Grupo «Viernes» de a con b y c; 1:1 a–b. z no tiene conversaciones.
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','z']);
insert into auth.users (id, email, aud, role)
select id, 'planlist-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
update profiles set display_name = 'Persona ' || upper(t.n) from t_users t where profiles.id = t.id;
select is(count(*)::int, 2, 'amistades') from (select public.social_make_friends(pg_temp.u('a'), id) from t_users where n in ('b','c')) s;

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Viernes', array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'id')::bigint);
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);

create function pg_temp.ref(p_id int, p_title text) returns jsonb language sql as $$
  select jsonb_build_object('mediaType', 'movie', 'tmdbId', p_id, 'title', p_title, 'poster', '/p.jpg') $$;
create function pg_temp.mine(p text, p_to date default null) returns jsonb language sql stable as $$
  select public.plan_mine(pg_temp.u(p), public.plan_today() - 3, p_to) $$;

-- Mañana a las 21:30 en el grupo (b va, c no puede) y hoy sin hora en el 1:1.
insert into t_v values ('p1', (public.plan_propose(pg_temp.u('a'), pg_temp.v('g'), pg_temp.ref(1, 'Perfect Days'), public.plan_today() + 1, '21:30', 'en casa de Ana') ->> 'plan_id')::bigint);
insert into t_v values ('p2', (public.plan_propose(pg_temp.u('a'), pg_temp.v('ab'), pg_temp.ref(2, 'Anatomía'), public.plan_today(), null, null) ->> 'plan_id')::bigint);
select is(public.plan_rsvp(pg_temp.u('b'), pg_temp.v('p1'), 'yes'), 'ok', 'b: voy');
select is(public.plan_rsvp(pg_temp.u('c'), pg_temp.v('p1'), 'no'), 'ok', 'c: no puedo');

-- ================================================================ plan_mine
select is(jsonb_array_length(pg_temp.mine('a') -> 'plans'), 2, 'a: sus dos planes (los propone, va)');
select is((select string_agg(x ->> 'title', ',') from jsonb_array_elements(pg_temp.mine('a') -> 'plans') x), 'Anatomía,Perfect Days', 'por fecha: hoy primero');
select is((pg_temp.mine('a') -> 'plans' -> 1 ->> 'with'), 'Viernes', 'en un grupo, con el nombre del grupo');
select is((pg_temp.mine('a') -> 'plans' -> 1 ->> 'yes')::int, 2, 'van 2 (a y b)');
select is((pg_temp.mine('a') -> 'plans' -> 1 ->> 'time'), '21:30', 'la hora en HH:MM');
select is((pg_temp.mine('a') -> 'plans' -> 0 ->> 'time'), null, 'sin hora: null');
select is((pg_temp.mine('a') -> 'plans' -> 0 ->> 'kind'), 'direct', 'el 1:1 dice que es directo');
select is((pg_temp.mine('a') -> 'plans' -> 0 ->> 'with'), 'Persona B', 'en un 1:1, con el nombre de la otra persona');
select is(jsonb_array_length(pg_temp.mine('b') -> 'plans'), 1, 'b: solo el que dijo «Voy» (el del 1:1 sin responder no)');
select is(jsonb_array_length(pg_temp.mine('c') -> 'plans'), 0, 'c: «No puedo» no sale');
select is((pg_temp.mine('c') ->> 'convs')::boolean, true, 'c tiene conversaciones (para la pista)');
select is(pg_temp.mine('z'), '{"plans": [], "convs": false}'::jsonb, 'z: nada y sin conversaciones');
select is(jsonb_array_length(pg_temp.mine('a', public.plan_today()) -> 'plans'), 1, 'con fin: solo hasta ese día');

-- Pasados: se quedan 3 días.
insert into watch_plans (conv_id, created_by, media_type, tmdb_id, title, plan_date) values
  (pg_temp.v('g'), pg_temp.u('a'), 'movie', 3, 'Hace 2 días', public.plan_today() - 2),
  (pg_temp.v('g'), pg_temp.u('a'), 'movie', 4, 'Hace 4 días', public.plan_today() - 4);
insert into watch_plan_rsvps (plan_id, user_id, answer) select id, pg_temp.u('a'), 'yes' from watch_plans where tmdb_id in (3, 4) and conv_id = pg_temp.v('g');
select is((select string_agg(x ->> 'title' || ':' || (x ->> 'past'), ',') from jsonb_array_elements(pg_temp.mine('a') -> 'plans') x where (x ->> 'past')::boolean),
  'Hace 2 días:true', 'el de hace 2 días sale como pasado; el de hace 4, no');

select is(public.plan_cancel(pg_temp.u('a'), pg_temp.v('p1')), 'ok', 'a cancela el del grupo');
select is((select count(*)::int from jsonb_array_elements(pg_temp.mine('b') -> 'plans')), 0, 'cancelado: ya no sale');

-- ================================================================ plan_today_sync
select is(public.plan_today_sync(pg_temp.u('a')), 1, 'a: el aviso de hoy');
select is(public.plan_today_sync(pg_temp.u('a')), 0, 'una sola vez');
select is((select title from notifications where user_id = pg_temp.u('a') and type = 'plan_today'),
  'Hoy: Anatomía con Persona B', 'sin hora: «Hoy: título con persona»');
select is((select subtitle || ' ' || href from notifications where user_id = pg_temp.u('a') and type = 'plan_today'),
  'Plan · van 1 /mislistas/amigos/mensajes/' || pg_temp.v('ab'), 'segunda línea y enlace al chat');
select is(public.plan_today_sync(pg_temp.u('b')), 0, 'b no ha respondido: nada');
select is(public.plan_rsvp(pg_temp.u('b'), pg_temp.v('p2'), 'yes'), 'ok', 'b: voy');
select is(public.plan_today_sync(pg_temp.u('b')), 1, 'b: ahora sí');
select is((select subtitle from notifications where user_id = pg_temp.u('b') and type = 'plan_today'), 'Plan · van 2', 'van 2');

-- Hoy a una hora que ya pasó: no.
insert into watch_plans (conv_id, created_by, media_type, tmdb_id, title, plan_date, plan_time) values
  (pg_temp.v('g'), pg_temp.u('c'), 'movie', 5, 'Ya pasó la hora', public.plan_today(), '00:00');
insert into watch_plan_rsvps (plan_id, user_id, answer) select id, pg_temp.u('c'), 'yes' from watch_plans where tmdb_id = 5;
select is(public.plan_today_sync(pg_temp.u('c')), 0, 'la hora ya pasó: sin aviso');

-- Con los avisos sociales apagados: no.
delete from notifications where type = 'plan_today';
update profiles set notif_prefs = jsonb_build_object('social', false) where id = pg_temp.u('a');
select is(public.plan_today_sync(pg_temp.u('a')), 0, 'avisos sociales apagados: nada');

select * from finish();
rollback;
