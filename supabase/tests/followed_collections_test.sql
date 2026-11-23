-- Pruebas de las sagas que sigues (migración 20261123100000_followed_collections.sql).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b']);
insert into auth.users (id, email, aud, role)
select id, 'sagatest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
grant select on t_users to authenticated;
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated')::text, true) $$;

-- a sigue dos sagas (el user_id lo pone auth.uid() por defecto); b, una.
select pg_temp.as_user('a');
set local role authenticated;
insert into followed_collections (collection_id, name) values (263, 'Batman (El caballero oscuro)'), (925155, 'Demon Slayer');
select is((select count(*)::int from followed_collections), 2, 'a ve sus dos sagas');
reset role;

select pg_temp.as_user('b');
set local role authenticated;
insert into followed_collections (collection_id, name) values (263, 'Batman (El caballero oscuro)');
select is((select count(*)::int from followed_collections), 1, 'b solo ve la suya, no las de a');
select throws_ok(
  format($q$ insert into followed_collections (user_id, collection_id) values (%L, 726871) $q$, pg_temp.u('a')),
  '42501', null, 'b no puede apuntarle una saga a a');
delete from followed_collections where collection_id = 925155;
reset role;
select is((select count(*)::int from followed_collections where user_id = pg_temp.u('a')), 2, 'b no puede borrar las de a');

select pg_temp.as_user('a');
set local role authenticated;
select throws_ok($q$ insert into followed_collections (collection_id) values (263) $q$, '23505', null, 'seguir dos veces la misma saga no duplica');
reset role;

-- Sin sesión, nada.
set local role anon;
select throws_ok($q$ select count(*) from followed_collections $q$, '42501', null, 'anon no puede leer');
reset role;

-- Borrar la cuenta borra sus sagas.
delete from auth.users where id = pg_temp.u('a');
select is((select count(*)::int from followed_collections where user_id = pg_temp.u('a')), 0, 'al borrar la cuenta se borran sus sagas');

select * from finish();
rollback;
