-- Pruebas de los avisos de tiempo real (migración 20261026090000_messages_realtime.sql).
-- Cada aviso de `realtime.send` queda como una fila en `realtime.messages` con su canal (`topic`):
-- aquí se cuenta cuántos le llegan a cada persona. Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c','z']);
insert into auth.users (id, email, aud, role)
select id, 'rttest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('b'));
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('c'));

-- Avisos recibidos por alguien (todos, o solo los de un tipo: 'c' conversación, 'n' campana).
create function pg_temp.pings(p text, k text default null) returns int language sql stable as $$
  select count(*)::int from realtime.messages m
  where m.topic = 'u:' || (select rt_key from public.profiles where id = pg_temp.u(p))::text
    and (k is null or m.payload ? k) $$;

select ok((select bool_and(rt_key is not null) from public.profiles where id in (select id from t_users)), 'rt_key: todo el mundo tiene clave');
select is((select count(distinct rt_key)::int from public.profiles where id in (select id from t_users)), 4, 'rt_key: distinta para cada persona');

create temp table t_v (k text primary key, v bigint);
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;

select is(public.msg_send(pg_temp.u('a'), pg_temp.v('ab'), 'hola', null) ->> 'ok', 'true', 'el mensaje se guarda con el aviso de por medio');
select ok(pg_temp.pings('b', 'c') >= 1, 'mensaje: le llega a la otra persona');
select ok(pg_temp.pings('a', 'c') >= 1, 'mensaje: y a quien lo envía (sus otras pestañas)');
select is(pg_temp.pings('c'), 0, 'mensaje: a nadie de fuera');
select is((select payload - 'id' from realtime.messages
           where topic = 'u:' || (select rt_key from public.profiles where id = pg_temp.u('b'))::text order by inserted_at desc limit 1),
          jsonb_build_object('c', pg_temp.v('ab')), 'el aviso es vacío: solo el id de la conversación (Realtime añade su propio id)');

-- «Visto»: cuando b lee, le llega a a.
create temp table t_n (k text primary key, v int);
insert into t_n values ('a_before', pg_temp.pings('a'));
select public.msg_read(pg_temp.u('b'), pg_temp.v('ab'), 999999999);
select ok(pg_temp.pings('a') > (select v from t_n where k = 'a_before'), 'visto: a se entera cuando b lee');

-- Grupo: al quitar a alguien, también le llega (para que desaparezca de su lista).
insert into t_v values ('g', (public.msg_create_group(pg_temp.u('a'), 'Grupo', array[pg_temp.u('b'), pg_temp.u('c')]) ->> 'id')::bigint);
insert into t_n values ('c_before', pg_temp.pings('c'));
select is(public.msg_remove_member(pg_temp.u('a'), pg_temp.v('g'), pg_temp.u('c')), 'ok', 'grupo: a quita a c');
select ok(pg_temp.pings('c') > (select v from t_n where k = 'c_before'), 'grupo: a quien quitan le llega el aviso');

-- Campana.
insert into t_n values ('z_before', pg_temp.pings('z', 'n'));
insert into public.notifications (user_id, id, type, title, subtitle, href, created_at, read)
values (pg_temp.u('z'), 'rt-test', 'new_follower', 'x', '', '/', now(), false);
select is(pg_temp.pings('z', 'n'), (select v from t_n where k = 'z_before') + 1, 'campana: aviso nuevo → {n:1} a su dueño');

-- Si Realtime falla, nada se rompe.
select lives_ok($$ select public.rt_ping(array[gen_random_uuid()], '{"c":1}'::jsonb) $$, 'rt_ping con alguien que no existe no falla');
select ok(not has_function_privilege('authenticated', 'public.rt_ping(uuid[], jsonb)', 'execute'), 'permisos: nadie de fuera puede mandar avisos');

select * from finish();
rollback;
