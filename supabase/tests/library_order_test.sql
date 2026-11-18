-- Pruebas de ordenar una lista fija a mano (migración 20261118090000_library_order.sql: Ver pronto).
-- Uso: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create temp table t_users (n text primary key, id uuid not null default gen_random_uuid());
insert into t_users (n) select unnest(array['a','b']);
insert into auth.users (id, email, aud, role)
select id, 'ordertest-' || n || '@example.com', 'authenticated', 'authenticated' from t_users;
create function pg_temp.u(p text) returns uuid language sql stable as $$ select id from t_users where n = p $$;
grant select on t_users to authenticated;

-- a: cinco en Ver pronto (sin orden: 10 es el más antiguo) y una en Favoritos; b: dos con los mismos ids.
insert into library_items (user_id, collection, tmdb_id, added_at)
select pg_temp.u('a'), 'MoviesVerPronto', id, now() - make_interval(days => 20 - id)
  from unnest(array[10, 11, 12, 13, 14]) id;
insert into library_items (user_id, collection, tmdb_id, position) values (pg_temp.u('a'), 'MovieFavs', 10, 1);
insert into library_items (user_id, collection, tmdb_id, position) values (pg_temp.u('b'), 'MoviesVerPronto', 10, 7), (pg_temp.u('b'), 'MoviesVerPronto', 11, 8);

-- Como el usuario a, igual que el servidor con su sesión.
create function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p), 'role', 'authenticated')::text, true) $$;
create function pg_temp.order_of(p text, c text) returns int[] language sql stable as $$
  select array_agg(tmdb_id order by position) from library_items where user_id = pg_temp.u(p) and collection = c $$;

select pg_temp.as_user('a');
set local role authenticated;
select public.reorder_library_items('MoviesVerPronto', array[13, 10, 14, 11, 12]);
reset role;
select is(pg_temp.order_of('a', 'MoviesVerPronto'), array[13, 10, 14, 11, 12], 'guarda el orden que manda la página');
select is((select array_agg(position order by position) from library_items where user_id = pg_temp.u('a') and collection = 'MoviesVerPronto'),
          array[1, 2, 3, 4, 5], 'posiciones 1..n, sin huecos');

-- La página no enseña los que tienen plan: los que no vienen van detrás, en el orden que tenían.
select pg_temp.as_user('a');
set local role authenticated;
select public.reorder_library_items('MoviesVerPronto', array[12, 11]);
reset role;
select is(pg_temp.order_of('a', 'MoviesVerPronto'), array[12, 11, 13, 10, 14], 'los que no vienen, detrás y sin perder su orden');

-- Repetidos o ids que no están en la lista no rompen nada.
select pg_temp.as_user('a');
set local role authenticated;
select public.reorder_library_items('MoviesVerPronto', array[14, 14, 999, 13]);
reset role;
select is(pg_temp.order_of('a', 'MoviesVerPronto'), array[14, 13, 12, 11, 10], 'un repetido cuenta una vez y un id ajeno se ignora');
select is((select array_agg(position order by position) from library_items where user_id = pg_temp.u('a') and collection = 'MoviesVerPronto'),
          array[1, 2, 3, 4, 5], 'sin huecos aunque viniera un id ajeno');

select is((select position from library_items where user_id = pg_temp.u('a') and collection = 'MovieFavs' and tmdb_id = 10), 1, 'no toca otras listas');
select is(pg_temp.order_of('b', 'MoviesVerPronto'), array[10, 11], 'no toca las de otra persona');
select is((select array_agg(position order by tmdb_id) from library_items where user_id = pg_temp.u('b')), array[7, 8], 'ni sus posiciones');

-- Sin sesión no se puede.
select ok(not has_function_privilege('anon', 'public.reorder_library_items(text, integer[])', 'execute'), 'anon no puede ordenar');
select ok(has_function_privilege('authenticated', 'public.reorder_library_items(text, integer[])', 'execute'), 'un usuario con sesión sí');

select * from finish();
rollback;
