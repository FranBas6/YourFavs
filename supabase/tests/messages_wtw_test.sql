-- Pruebas de «¿Qué vemos?» (migración 20261031090000_messages_wtw.sql, handoff M4 §2.3 y §3.6).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- a es amiga de b, c y d; d y b no son amigas (pero están en el mismo grupo). z no está.
create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','d','z']);
insert into auth.users (id, email, aud, role)
select id, 'wtwtest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
create function pg_temp.us(p text[]) returns uuid[] language sql stable as $$ select array_agg(id) from t_users where n = any (p) $$;
select public.social_make_friends(pg_temp.u('a'), id) from t_users where n in ('b','c','d');

create temp table t_v (k text primary key, v bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Viernes', array[pg_temp.u('b'), pg_temp.u('c'), pg_temp.u('d')]) ->> 'id')::bigint);
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);

-- Pendientes: 100 lo tienen las 4; 200 lo tienen a, b, c; 300 solo a; 400 b y d (sin a).
insert into public.library_items (user_id, collection, tmdb_id)
select id, 'MoviesPendientes', 100 from t_users where n in ('a','b','c','d')
union all select id, 'MoviesPendientes', 200 from t_users where n in ('a','b','c')
union all select pg_temp.u('a'), 'MoviesPendientes', 300
union all select id, 'SeriesPendiente', 400 from t_users where n in ('b','d');

create function pg_temp.pool(p_me text, p_conv bigint, p_who text[]) returns text language sql as $$
  select coalesce(string_agg(tmdb_id || ':' || cardinality(have) || '/' || of, ',' order by tmdb_id), '')
  from public.msg_wtw_pool(pg_temp.u(p_me), p_conv, pg_temp.us(p_who)) $$;

select is(pg_temp.pool('a', pg_temp.v('g'), array['a','b','c','d']), '100:4/4,200:3/4', 'las 4: las de las 4 y las de 3 de 4 (400, solo de 2: fuera)');
select is(pg_temp.pool('a', pg_temp.v('ab'), array['a','b']), '100:2/2,200:2/2', '1:1: solo lo de los dos (sin bajar a 1 de 2)');
select is(pg_temp.pool('a', pg_temp.v('g'), array['a']), '', 'una sola persona: nada');
select is(pg_temp.pool('a', pg_temp.v('g'), array['b','c']), '', 'sin ti: nada');
select is(pg_temp.pool('a', pg_temp.v('g'), array['a','z']), '', 'con alguien de fuera: nada');
select is(pg_temp.pool('z', pg_temp.v('g'), array['z','a']), '', 'quien no está: nada');
-- d no es amiga de b, pero sus pendientes cuentan para b.
select is(pg_temp.pool('b', pg_temp.v('g'), array['b','d']), '100:2/2,400:2/2', 'b con d (no amigas): también cuenta lo de d');

-- Lo oculto de un perfil no entra.
insert into public.profile_hidden_titles (user_id, media_type, tmdb_id) values (pg_temp.u('c'), 'movie', 200);
select is(pg_temp.pool('a', pg_temp.v('g'), array['a','b','c']), '100:3/3,200:2/3', 'c ocultó 200: deja de contar para c');
-- Bloqueo con alguien de la tirada: nada.
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.u('d'), pg_temp.u('a'));
select is(pg_temp.pool('a', pg_temp.v('g'), array['a','d']), '', 'con un bloqueo de por medio: nada');

-- ================================================================ enviar
select is(public.msg_send_wtw(pg_temp.u('a'), pg_temp.v('g'), '{"mediaType":"movie","tmdbId":100,"title":"X","of":4,"have":[]}') #>> '{message,card,type}', 'wtw',
  'enviar la tirada: tarjeta wtw');
select is((select card_ref ->> 'roller' from messages where conv_id = pg_temp.v('g') and card_type = 'wtw' order by id desc limit 1), pg_temp.u('a')::text,
  'con quién tiró');
select is(public.msg_send_wtw(pg_temp.u('z'), pg_temp.v('g'), '{}') ->> 'error', 'none', 'quien no está no puede enviar');
select is((public.msg_history(pg_temp.u('b'), pg_temp.v('g')) -> 'messages' -> -1 -> 'card' ->> 'type'), 'wtw', 'el grupo la ve');

select ok(not has_function_privilege('authenticated', 'public.msg_wtw_pool(uuid, bigint, uuid[])', 'execute'), 'permisos: solo el servidor');

select * from finish();
rollback;
