-- «Limpiar» el desplegable de Mensajes (migración 20261027090000_messages_inbox_clear.sql).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b','c']);
insert into auth.users (id, email, aud, role)
select id, 'cltest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('b'));
select public.social_make_friends(pg_temp.u('a'), pg_temp.u('c'));
create temp table t_v (k text primary key, v bigint);
insert into t_v values ('ab', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('b')) ->> 'id')::bigint);
insert into t_v values ('ac', (public.msg_open_direct(pg_temp.u('a'), pg_temp.u('c')) ->> 'id')::bigint);
create function pg_temp.v(p text) returns bigint language sql stable as $$ select v from t_v where k = p $$;
create function pg_temp.row(p text, c bigint) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.msg_list(pg_temp.u(p))) r where (r ->> 'id')::bigint = c $$;

select '· ' || coalesce((public.msg_send(pg_temp.u('b'), pg_temp.v('ab'), 'hola a', null))::text, '');
select '· ' || coalesce((public.msg_send(pg_temp.u('c'), pg_temp.v('ac'), 'hola desde c', null))::text, '');
select is(public.msg_unread_total(pg_temp.u('a')), 2, 'antes: 2 sin leer');
select is(pg_temp.row('a', pg_temp.v('ab')) ->> 'cleared', 'false', 'antes: no está limpiada');

select '· ' || coalesce((public.msg_clear_inbox(pg_temp.u('a')))::text, '');
select is(public.msg_unread_total(pg_temp.u('a')), 0, 'limpiar: el contador a 0');
select is(pg_temp.row('a', pg_temp.v('ab')) ->> 'cleared', 'true', 'limpiar: fuera del desplegable');
select is((pg_temp.row('a', pg_temp.v('ab')) ->> 'unread')::int, 0, 'limpiar: la fila sin negrita');
select is((select last_read_id from conversation_members where conv_id = pg_temp.v('ab') and user_id = pg_temp.u('a')), null,
          'limpiar NO es leer: last_read_id intacto');
select is((public.msg_history(pg_temp.u('b'), pg_temp.v('ab')) ->> 'seen_id'), null, 'limpiar NO es leer: b no recibe «Visto»');
select is(public.msg_unread_total(pg_temp.u('b')), 0, 'limpiar es solo tuyo: a b no le cambia nada');

select '· ' || coalesce((public.msg_send(pg_temp.u('b'), pg_temp.v('ab'), 'otra cosa', null))::text, '');
select is(pg_temp.row('a', pg_temp.v('ab')) ->> 'cleared', 'false', 'mensaje nuevo: vuelve al desplegable');
select is(public.msg_unread_total(pg_temp.u('a')), 1, 'mensaje nuevo: cuenta solo lo nuevo');
select is(pg_temp.row('a', pg_temp.v('ac')) ->> 'cleared', 'true', 'la otra sigue limpia');
select ok(not has_function_privilege('authenticated', 'public.msg_clear_inbox(uuid)', 'execute'), 'permisos: solo el servidor');

select * from finish();
rollback;
