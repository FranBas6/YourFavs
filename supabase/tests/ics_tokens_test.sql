-- Pruebas de la dirección secreta del calendario (migración 20261103090000_ics_tokens.sql,
-- handoff M5 §3.8). Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b']);
insert into auth.users (id, email, aud, role)
select id, 'icstest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
create temp table t_v (k text primary key, v text);

select ok(public.ics_new_token() ~ '^[0-9A-Za-z]{43}$', 'el token: 43 caracteres base62');
select isnt(public.ics_new_token(), public.ics_new_token(), 'cada token es distinto');

select is((select ics_token from profiles where id = pg_temp.u('a')), null, 'sin dirección hasta pedirla');
insert into t_v values ('a1', public.ics_token_get(pg_temp.u('a')));
select ok((select v from t_v where k = 'a1') is not null, 'pedirla la crea');
select is(public.ics_token_get(pg_temp.u('a')), (select v from t_v where k = 'a1'), 'pedirla otra vez da la misma');
select isnt(public.ics_token_get(pg_temp.u('b')), (select v from t_v where k = 'a1'), 'b tiene la suya');
select is(public.ics_token_get(gen_random_uuid()), null, 'sin perfil: null');

select is((select user_id from public.ics_owner((select v from t_v where k = 'a1'))), pg_temp.u('a'), 'la dirección es de a');
select is((select plans from public.ics_owner((select v from t_v where k = 'a1'))), true, '«Incluir mis planes», encendido por defecto');
select is((select count(*)::int from public.ics_owner('nope')), 0, 'una dirección mal formada no es de nadie');
select is((select count(*)::int from public.ics_owner(repeat('A', 43))), 0, 'una que no existe, tampoco');

insert into t_v values ('a2', public.ics_token_rotate(pg_temp.u('a')));
select isnt((select v from t_v where k = 'a2'), (select v from t_v where k = 'a1'), 'crear una nueva la cambia');
select is((select count(*)::int from public.ics_owner((select v from t_v where k = 'a1'))), 0, 'la anterior deja de funcionar');
select is((select user_id from public.ics_owner((select v from t_v where k = 'a2'))), pg_temp.u('a'), 'la nueva funciona');

update profiles set ics_plans = false where id = pg_temp.u('a');
select is((select plans from public.ics_owner((select v from t_v where k = 'a2'))), false, 'sin planes si lo apaga');

select throws_ok($$ update profiles set ics_token = 'corto' where id = (select id from t_users where n = 'b') $$, '23514', null, 'el formato lo exige la tabla');

-- Nadie fuera del servidor puede llamarlas.
select ok(not has_function_privilege('authenticated', 'public.ics_owner(text)', 'execute'), 'authenticated no lee direcciones');
select ok(not has_function_privilege('anon', 'public.ics_token_get(uuid)', 'execute'), 'anon no las crea');

select * from finish();
rollback;
